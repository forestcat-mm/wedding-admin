-- ============================================================
-- wedding-admin スキーマ（実DB public スキーマの pg_dump から 2026-09-25 に作り直し）
-- 元：work/schema_dump.sql（pg_dump --schema-only）。文の中身は変えず、並びだけ整理した。
--   拡張 → 関数 → テーブル → 主キー・一意・外部キー → インデックス → トリガー → RLS 有効化 → ポリシー → 権限
-- 末尾に Photo Toss（wedding-photos）用の表と、ダンプに含まれない storage の設定。
-- ============================================================


-- ============================================================
-- 拡張
-- ============================================================

-- pgcrypto（gen_random_uuid / crypt / gen_salt）。Supabase では extensions スキーマに入っている
create extension if not exists pgcrypto with schema extensions;


-- ============================================================
-- 関数
-- ============================================================

-- gen_reception_id：受付番号（5桁）を重複しないように発番
CREATE FUNCTION public.gen_reception_id() RETURNS text
    LANGUAGE plpgsql
    AS $$
declare v text;
begin
  loop
    v := (floor(random() * 90000) + 10000)::int::text;
    exit when not exists (select 1 from public.guests where reception_id = v);
  end loop;
  return v;
end $$;

-- mark_superseded：同じ人の以前の回答に superseded_by / duplicate_reason を付ける（重複回答の判定。sync_rsvp_row から呼ぶ）
CREATE FUNCTION public.mark_superseded(p_id uuid, p_received timestamp with time zone, p_email text, p_fam text, p_giv text, p_fam_l text, p_giv_l text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare prev record;
begin
  for prev in
    select id,
      case when coalesce(p_email,'')<>'' and lower(trim(email)) = lower(trim(p_email)) then 'メール一致'
           when norm_name(family_name)=norm_name(p_fam) and norm_name(given_name)=norm_name(p_giv) then '漢字氏名一致'
           else 'ローマ字氏名一致' end as why
    from replies_admin
    where id <> p_id and deleted_at is null and superseded_by is null and received_at < p_received
      and ( (coalesce(p_email,'')<>'' and lower(trim(email)) = lower(trim(p_email)))
         or (norm_name(family_name)=norm_name(p_fam) and norm_name(given_name)=norm_name(p_giv))
         or (norm_name(p_fam_l)<>'' and norm_name(family_name_latin)=norm_name(p_fam_l)
             and norm_name(given_name_latin)=norm_name(p_giv_l)) )
  loop
    update replies_admin set superseded_by = p_id, duplicate_reason = prev.why where id = prev.id;
  end loop;
end $$;

-- norm_name：名前の正規化（空白を除いて小文字に）
CREATE FUNCTION public.norm_name(t text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select lower(regexp_replace(translate(coalesce(t,''), '　 ', ''), '\s', '', 'g'))
$$;

-- rls_auto_enable：新しく作った表に自動で RLS を有効にするイベントトリガー用（Supabase 側）
CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

-- seating_save：配席の編集モードの「保存」。1トランザクションで反映し、updated_at と割当の行数で同時編集を検知する
CREATE FUNCTION public.seating_save(p_since_tables timestamp with time zone, p_since_asg timestamp with time zone, p_since_ev timestamp with time zone, p_del_tables uuid[], p_tables jsonb, p_moved_tables uuid[], p_del_asg uuid[], p_asg jsonb, p_moved_asg uuid[], p_ev jsonb, p_since_asg_count integer DEFAULT NULL::integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
begin
  if (select coalesce(max(updated_at), '-infinity'::timestamptz) from seating_tables) > coalesce(p_since_tables, '-infinity'::timestamptz)
     or (select coalesce(max(updated_at), '-infinity'::timestamptz) from seating_assignments) > coalesce(p_since_asg, '-infinity'::timestamptz)
     or (select coalesce(updated_at, '-infinity'::timestamptz) from event_settings where id = 1) > coalesce(p_since_ev, '-infinity'::timestamptz)
     or (p_since_asg_count is not null and (select count(*) from seating_assignments) <> p_since_asg_count) then
    raise exception 'seating_conflict' using errcode = '40001';
  end if;

  delete from seating_assignments where id = any(coalesce(p_del_asg, '{}'));
  delete from seating_tables where id = any(coalesce(p_del_tables, '{}'));

  update seating_tables set grid_row = null, grid_col = null where id = any(coalesce(p_moved_tables, '{}'));
  insert into seating_tables (id, label, capacity, shape, x, y, w, h, rotation, memo, sort_order, grid_row, grid_col)
  select r.id, r.label, r.capacity, r.shape, coalesce(r.x, 0), coalesce(r.y, 0), r.w, r.h, coalesce(r.rotation, 0), r.memo,
         coalesce(r.sort_order, 0), r.grid_row, r.grid_col
  from jsonb_to_recordset(coalesce(p_tables, '[]')) as r(id uuid, label text, capacity int, shape text, x numeric, y numeric,
         w numeric, h numeric, rotation int, memo text, sort_order int, grid_row int, grid_col int)
  on conflict (id) do update set
    label = excluded.label, capacity = excluded.capacity, shape = excluded.shape, x = excluded.x, y = excluded.y,
    w = excluded.w, h = excluded.h, rotation = excluded.rotation, memo = excluded.memo, sort_order = excluded.sort_order,
    grid_row = excluded.grid_row, grid_col = excluded.grid_col, updated_at = now();

  update seating_assignments set seat_index = null where id = any(coalesce(p_moved_asg, '{}'));
  insert into seating_assignments (id, table_id, seat_index, person_type, person_id, provisional)
  select r.id, r.table_id, r.seat_index, r.person_type, r.person_id, coalesce(r.provisional, false)
  from jsonb_to_recordset(coalesce(p_asg, '[]')) as r(id uuid, table_id uuid, seat_index int, person_type text, person_id uuid, provisional boolean)
  on conflict (id) do update set
    table_id = excluded.table_id, seat_index = excluded.seat_index, person_type = excluded.person_type,
    person_id = excluded.person_id, provisional = excluded.provisional, updated_at = now();

  if p_ev is not null then
    update event_settings set
      seating_note = case when p_ev ? 'seating_note' then p_ev->>'seating_note' else seating_note end,
      layout_rows  = case when p_ev ? 'layout_rows'  then (p_ev->>'layout_rows')::int else layout_rows end,
      layout_cols  = case when p_ev ? 'layout_cols'  then (p_ev->>'layout_cols')::int else layout_cols end,
      row_counts   = case when p_ev ? 'row_counts'   then (select array_agg(v::int) from jsonb_array_elements_text(p_ev->'row_counts') v) else row_counts end,
      short_row_align = case when p_ev ? 'short_row_align' then p_ev->>'short_row_align' else short_row_align end,
      updated_at   = now()
    where id = 1;
  end if;
end $$;

-- set_reception_id：guests の insert 時に reception_id を自動発番するトリガー関数
CREATE FUNCTION public.set_reception_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.reception_id is null then
    new.reception_id := public.gen_reception_id();
  end if;
  return new;
end $$;

-- share_lookup：シェアページ：トークンとパスワードで友人圏の回答者一覧を返す（anon から呼ぶ）
CREATE FUNCTION public.share_lookup(p_token text, p_password text) RETURNS TABLE(family_name text, given_name text, family_name_latin text, given_name_latin text, attending boolean, circle_name text, headline text, show_latin boolean, page_title text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare l share_links; c circles;
begin
  select * into l from share_links
   where token = p_token and enabled and (expires_at is null or expires_at >= current_date);
  if l.id is null or l.password_hash <> crypt(p_password, l.password_hash) then
    raise exception 'invalid' using errcode = '28000';
  end if;
  select * into c from circles where id = l.circle_id;
  return query
    select p.family_name, p.given_name, p.family_name_latin, p.given_name_latin, p.attending,
           c.name, l.headline, l.show_latin, l.page_title
    from replies_admin ra
    join reply_people p on p.reply_id = ra.id and p.idx = 0 and p.deleted_at is null
    join guest_circles gc on gc.guest_id = ra.matched_guest_id and gc.circle_id = l.circle_id
    where ra.deleted_at is null
      and ra.superseded_by is null
      and ra.attending is not null
    order by p.attending desc, p.family_name_latin, p.given_name_latin;
end $$;

-- share_set_password：シェアページのパスワード設定（管理画面から）
CREATE FUNCTION public.share_set_password(p_link uuid, p_password text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    AS $$
  update share_links set password_hash = crypt(p_password, gen_salt('bf')) where id = p_link
$$;

-- touch_parent_reply：reply_people が変わったら親 replies_admin.updated_at を更新
CREATE FUNCTION public.touch_parent_reply() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  update replies_admin set updated_at = now() where id = new.reply_id;
  return new;
end $$;

-- touch_updated_at：updated_at を更新する共通トリガー関数
CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin new.updated_at = now(); return new; end $$;

-- trg_sync_rsvp：新着回答を自動同期するトリガー関数
CREATE FUNCTION public.trg_sync_rsvp() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
begin
  perform sync_rsvp_row(new);
  return new;
end $$;


-- ============================================================
-- テーブル（列・既定値・CHECK）
-- ============================================================

-- ---------- rsvp ----------
-- 招待状サイト（wedding-invite）が anon で insert する回答の原本。管理画面は読み取りのみで、原本は replies_admin.original にも写す
CREATE TABLE public.rsvp (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    lang text NOT NULL,
    attending boolean NOT NULL,
    family_name text NOT NULL,
    given_name text NOT NULL,
    family_name_latin text NOT NULL,
    given_name_latin text NOT NULL,
    side text,
    email text NOT NULL,
    country text,
    region text,
    allergy text,
    dietary text,
    companions jsonb DEFAULT '[]'::jsonb NOT NULL,
    message text,
    needs text,
    honeypot text,
    messenger text,
    photos jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT rsvp_companions_check CHECK ((jsonb_typeof(companions) = 'array'::text)),
    CONSTRAINT rsvp_honeypot_check CHECK (((honeypot IS NULL) OR (honeypot = ''::text))),
    CONSTRAINT rsvp_lang_check CHECK ((lang = ANY (ARRAY['ja'::text, 'zh'::text]))),
    CONSTRAINT rsvp_photos_check CHECK ((jsonb_typeof(photos) = 'array'::text)),
    CONSTRAINT rsvp_side_check CHECK ((side = ANY (ARRAY['groom'::text, 'bride'::text])))
);

-- ---------- guests ----------
-- 招待リスト（打診済み）。line_joined / wechat_joined は公式登録、auto_created / source_reply_id は回答から自動作成した招待者。reception_id / checked_in_* は受付用
CREATE TABLE public.guests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    family_name text NOT NULL,
    given_name text NOT NULL,
    family_name_latin text,
    given_name_latin text,
    side text,
    contact_tool text,
    messenger_id text,
    email text,
    note text,
    deleted_at timestamp with time zone,
    delete_reason text,
    line_joined boolean DEFAULT false NOT NULL,
    wechat_joined boolean DEFAULT false NOT NULL,
    auto_created boolean DEFAULT false NOT NULL,
    source_reply_id uuid,
    transport_fee integer DEFAULT 0 NOT NULL,
    transport_note text,
    gift_note text,
    title text,
    reception_id text,
    checked_in_at timestamp with time zone,
    checked_in_by text,
    CONSTRAINT guests_contact_tool_check CHECK ((contact_tool = ANY (ARRAY['line'::text, 'wechat'::text, 'email'::text, 'phone'::text, 'facebook'::text, 'instagram'::text, 'other'::text]))),
    CONSTRAINT guests_reception_id_format CHECK ((reception_id ~ '^[1-9][0-9]{4}$'::text)),
    CONSTRAINT guests_side_check CHECK ((side = ANY (ARRAY['groom'::text, 'bride'::text])))
);

-- ---------- circles ----------
-- 友人圏タグ
CREATE TABLE public.circles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- ---------- guest_circles ----------
-- 招待者と友人圏タグの対応
CREATE TABLE public.guest_circles (
    guest_id uuid NOT NULL,
    circle_id uuid NOT NULL
);

-- ---------- replies_admin ----------
-- 回答の管理用コピー（1送信1行）。姓名列は同期時に rsvp から写す。superseded_by / duplicate_reason は重複回答の判定、source は guest（招待状）／admin（代理入力）
CREATE TABLE public.replies_admin (
    id uuid NOT NULL,
    received_at timestamp with time zone NOT NULL,
    lang text,
    attending boolean,
    side text,
    email text,
    messenger text,
    country text,
    region text,
    message text,
    needs text,
    photos jsonb DEFAULT '[]'::jsonb,
    original jsonb NOT NULL,
    matched_guest_id uuid,
    match_type text,
    admin_note text,
    deleted_at timestamp with time zone,
    delete_reason text,
    updated_at timestamp with time zone DEFAULT now(),
    family_name text,
    given_name text,
    family_name_latin text,
    given_name_latin text,
    superseded_by uuid,
    duplicate_reason text,
    source text DEFAULT 'guest'::text NOT NULL,
    CONSTRAINT replies_admin_match_type_check CHECK ((match_type = ANY (ARRAY['auto'::text, 'manual'::text, 'unlisted'::text]))),
    CONSTRAINT replies_admin_source_check CHECK ((source = ANY (ARRAY['guest'::text, 'admin'::text])))
);

-- ---------- reply_people ----------
-- 1人1行（本人 idx=0 ＋同行者）。title は同行者の肩書き（本人は guests.title）
CREATE TABLE public.reply_people (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reply_id uuid,
    idx integer NOT NULL,
    is_companion boolean NOT NULL,
    family_name text,
    given_name text,
    family_name_latin text,
    given_name_latin text,
    attending boolean,
    is_child boolean DEFAULT false,
    birthdate date,
    age integer,
    allergy text,
    dietary text,
    deleted_at timestamp with time zone,
    delete_reason text,
    updated_at timestamp with time zone DEFAULT now(),
    title text,
    kids_chair boolean DEFAULT false NOT NULL,
    kid_meal text,
    CONSTRAINT reply_people_kid_meal_check CHECK (((kid_meal IS NULL) OR (kid_meal = ANY (ARRAY['A'::text, 'B'::text, 'C'::text])))),
    CONSTRAINT reply_people_title_check CHECK (((title IS NULL) OR (title = ANY (ARRAY['御令息'::text, '御令嬢'::text, '令夫人'::text, '令夫君'::text]))))
);

-- ---------- change_log ----------
-- 変更履歴（管理画面の操作ログ）
CREATE TABLE public.change_log (
    id bigint NOT NULL,
    at timestamp with time zone DEFAULT now(),
    actor text,
    target_table text NOT NULL,
    target_id uuid NOT NULL,
    action text NOT NULL,
    reason text NOT NULL,
    diff jsonb
);

CREATE SEQUENCE public.change_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.change_log_id_seq OWNED BY public.change_log.id;
ALTER TABLE ONLY public.change_log ALTER COLUMN id SET DEFAULT nextval('public.change_log_id_seq'::regclass);

-- ---------- share_links ----------
-- 友人圏ごとのシェアページ（トークン＋パスワード）
CREATE TABLE public.share_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    circle_id uuid,
    token text NOT NULL,
    password_hash text NOT NULL,
    headline text,
    show_latin boolean DEFAULT true,
    expires_at date,
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    page_title text
);

-- ---------- title_options ----------
-- 招待者の肩書きの選択肢（自己定義可）
CREATE TABLE public.title_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 100 NOT NULL
);

-- ---------- budget_settings ----------
-- 予算の前提（1行）
CREATE TABLE public.budget_settings (
    id integer DEFAULT 1 NOT NULL,
    adult_mode text DEFAULT 'auto'::text NOT NULL,
    adult_manual integer DEFAULT 0 NOT NULL,
    child_mode text DEFAULT 'auto'::text NOT NULL,
    child_manual integer DEFAULT 0 NOT NULL,
    tables_mode text DEFAULT 'auto'::text NOT NULL,
    tables_manual integer DEFAULT 0 NOT NULL,
    seats_per_table integer DEFAULT 8 NOT NULL,
    hh_mode text DEFAULT 'auto'::text NOT NULL,
    hh_manual integer DEFAULT 0 NOT NULL,
    gift_per_adult integer DEFAULT 30000 NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT budget_settings_adult_mode_check CHECK ((adult_mode = ANY (ARRAY['auto'::text, 'manual'::text]))),
    CONSTRAINT budget_settings_child_mode_check CHECK ((child_mode = ANY (ARRAY['auto'::text, 'manual'::text]))),
    CONSTRAINT budget_settings_hh_mode_check CHECK ((hh_mode = ANY (ARRAY['auto'::text, 'manual'::text]))),
    CONSTRAINT budget_settings_id_check CHECK ((id = 1)),
    CONSTRAINT budget_settings_tables_mode_check CHECK ((tables_mode = ANY (ARRAY['auto'::text, 'manual'::text])))
);

-- ---------- budget_items ----------
-- ホテル見積の項目
CREATE TABLE public.budget_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sort_order integer NOT NULL,
    category text NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    unit_price numeric,
    qty integer,
    base_qty integer DEFAULT 0,
    split text,
    manual_qty integer,
    allowance numeric DEFAULT 0,
    tax_label text,
    gift_type text,
    grp text,
    note text,
    paid boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT budget_items_gift_type_check CHECK ((gift_type = ANY (ARRAY['hikidemono'::text, 'hikigashi'::text]))),
    CONSTRAINT budget_items_kind_check CHECK ((kind = ANY (ARRAY['fix'::text, 'pp'::text, 'pt'::text, 'man'::text, 'kid'::text, 'cloth'::text, 'cloth0'::text]))),
    CONSTRAINT budget_items_split_check CHECK ((split = ANY (ARRAY['high'::text, 'low'::text])))
);

-- ---------- budget_external ----------
-- 個別手配分（ホテル以外への支払い）
CREATE TABLE public.budget_external (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    name text NOT NULL,
    vendor text,
    unit_price numeric DEFAULT 0 NOT NULL,
    qty integer DEFAULT 0 NOT NULL,
    pay_status text DEFAULT '検討中'::text NOT NULL,
    storage_status text DEFAULT '—'::text NOT NULL,
    receive_date date,
    gift_type text,
    note text,
    deleted_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT budget_external_gift_type_check CHECK ((gift_type = ANY (ARRAY['hikidemono'::text, 'hikigashi'::text]))),
    CONSTRAINT budget_external_pay_status_check CHECK ((pay_status = ANY (ARRAY['検討中'::text, '予約済（未払）'::text, '支払済'::text]))),
    CONSTRAINT budget_external_storage_status_check CHECK ((storage_status = ANY (ARRAY['—'::text, '注文済'::text, '自宅保管'::text, 'ホテル預け'::text])))
);

-- ---------- event_settings ----------
-- 基本情報（1行）：両家の姓名・座席表タイトル・卓のグリッド・全体の申し送り
CREATE TABLE public.event_settings (
    id integer DEFAULT 1 NOT NULL,
    groom_name_latin text DEFAULT 'Takayuki MORI'::text,
    bride_name_latin text DEFAULT 'Momoe YOSHINAGA'::text,
    seating_note text,
    updated_at timestamp with time zone DEFAULT now(),
    groom_family text DEFAULT '森'::text,
    groom_given text DEFAULT '喬由樹'::text,
    bride_family text DEFAULT '吉永'::text,
    bride_given text DEFAULT '百慧'::text,
    chart_title text DEFAULT '両家結婚披露宴御座席表'::text,
    layout_rows integer DEFAULT 3,
    layout_cols integer DEFAULT 4,
    row_counts integer[] DEFAULT '{4,4,2}'::integer[],
    short_row_align text DEFAULT 'center'::text NOT NULL,
    CONSTRAINT event_settings_id_check CHECK ((id = 1)),
    CONSTRAINT event_settings_short_row_align_check CHECK ((short_row_align = ANY (ARRAY['left'::text, 'right'::text, 'center'::text, 'ends'::text])))
);

-- ---------- seating_tables ----------
-- 卓。grid_row / grid_col は並び順（sort_order）からアプリが計算して保存時に書く。高砂は卓ではない
CREATE TABLE public.seating_tables (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text NOT NULL,
    capacity integer DEFAULT 8 NOT NULL,
    shape text DEFAULT 'round'::text NOT NULL,
    x numeric DEFAULT 0 NOT NULL,
    y numeric DEFAULT 0 NOT NULL,
    w numeric,
    h numeric,
    rotation integer DEFAULT 0 NOT NULL,
    memo text,
    sort_order integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    grid_row integer,
    grid_col integer,
    CONSTRAINT seating_tables_capacity_check CHECK (((capacity >= 0) AND (capacity <= 10))),
    CONSTRAINT seating_tables_shape_check CHECK ((shape = ANY (ARRAY['round'::text, 'rect'::text])))
);

-- ---------- seating_assignments ----------
-- 席の割当。1人は1席（person_type, person_id）、卓内の席番号は一意（table_id, seat_index）
CREATE TABLE public.seating_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_id uuid NOT NULL,
    seat_index integer,
    person_type text NOT NULL,
    person_id uuid NOT NULL,
    provisional boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT seating_assignments_person_type_check CHECK ((person_type = ANY (ARRAY['reply_person'::text, 'guest'::text])))
);

-- ---------- reception_items ----------
-- 受付：招待者ごとの引き渡し物（席次表・お車代など）
CREATE TABLE public.reception_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    guest_id uuid NOT NULL,
    label text NOT NULL,
    note text,
    handed_at timestamp with time zone,
    handed_by text,
    sort integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ---------- reception_tokens ----------
-- 受付：受付端末用のアクセスコード
CREATE TABLE public.reception_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    label text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    expires_at timestamp with time zone,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    default_side text DEFAULT 'all'::text NOT NULL,
    CONSTRAINT reception_tokens_default_side_check CHECK ((default_side = ANY (ARRAY['groom'::text, 'bride'::text, 'all'::text])))
);

-- sync_rsvp_row：rsvp 1行を replies_admin / reply_people に展開し、招待者と突き合わせる（トリガーと初回取り込みで共用）（引数に rsvp 型を使うのでテーブルの後に定義）
CREATE FUNCTION public.sync_rsvp_row(r public.rsvp) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  g uuid; n int; mt text;
begin
  -- 招待者との突き合わせ（4欄完全一致）
  select count(*), (array_agg(id))[1] into n, g from guests
   where deleted_at is null
     and norm_name(family_name)       = norm_name(r.family_name)
     and norm_name(given_name)        = norm_name(r.given_name)
     and norm_name(family_name_latin) = norm_name(r.family_name_latin)
     and norm_name(given_name_latin)  = norm_name(r.given_name_latin);
  if n = 1 then mt := 'auto';
  elsif n = 0 then
    insert into guests (family_name, given_name, family_name_latin, given_name_latin, side,
                        messenger_id, email, auto_created, source_reply_id)
    values (r.family_name, r.given_name, r.family_name_latin, r.given_name_latin,
            case when r.side in ('groom','bride') then r.side end, r.messenger, r.email, true, r.id)
    returning id into g;
    mt := 'unlisted';
  else g := null; mt := null; end if;

  insert into replies_admin (id, received_at, lang, attending, side, email, messenger, country, region,
                             message, needs, photos, original, matched_guest_id, match_type,
                             family_name, given_name, family_name_latin, given_name_latin)
  values (r.id, r.created_at, r.lang, r.attending, r.side, r.email, r.messenger, r.country, r.region,
          r.message, r.needs, coalesce(r.photos,'[]'), to_jsonb(r), g, mt,
          r.family_name, r.given_name, r.family_name_latin, r.given_name_latin)
  on conflict (id) do nothing;

  insert into reply_people (reply_id, idx, is_companion, family_name, given_name, family_name_latin, given_name_latin,
                            attending, is_child, allergy, dietary)
  values (r.id, 0, false, r.family_name, r.given_name, r.family_name_latin, r.given_name_latin,
          r.attending, false, r.allergy, r.dietary)
  on conflict do nothing;

  insert into reply_people (reply_id, idx, is_companion, family_name, given_name, family_name_latin, given_name_latin,
                            attending, is_child, birthdate, age, allergy, dietary)
  select r.id, ord, true, c->>'family_name', c->>'given_name', c->>'family_name_latin', c->>'given_name_latin',
         r.attending, coalesce((c->>'is_child')::boolean,false),
         nullif(c->>'birthdate','')::date, nullif(c->>'age','')::int, c->>'allergy', c->>'dietary'
  from jsonb_array_elements(coalesce(r.companions,'[]')) with ordinality as t(c, ord)
  on conflict do nothing;

  -- 過去の同一人物の回答に重複印
  perform mark_superseded(r.id, r.created_at, r.email, r.family_name, r.given_name, r.family_name_latin, r.given_name_latin);
end $$;


-- ============================================================
-- 主キー・一意・外部キー
-- ============================================================

ALTER TABLE ONLY public.rsvp
    ADD CONSTRAINT rsvp_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.guests
    ADD CONSTRAINT guests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.circles
    ADD CONSTRAINT circles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.guest_circles
    ADD CONSTRAINT guest_circles_pkey PRIMARY KEY (guest_id, circle_id);
ALTER TABLE ONLY public.replies_admin
    ADD CONSTRAINT replies_admin_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.reply_people
    ADD CONSTRAINT reply_people_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.change_log
    ADD CONSTRAINT change_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.title_options
    ADD CONSTRAINT title_options_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.budget_settings
    ADD CONSTRAINT budget_settings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.budget_items
    ADD CONSTRAINT budget_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.budget_external
    ADD CONSTRAINT budget_external_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.event_settings
    ADD CONSTRAINT event_settings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.seating_tables
    ADD CONSTRAINT seating_tables_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.seating_assignments
    ADD CONSTRAINT seating_assignments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.reception_items
    ADD CONSTRAINT reception_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.reception_tokens
    ADD CONSTRAINT reception_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.guests
    ADD CONSTRAINT guests_reception_id_unique UNIQUE (reception_id);
ALTER TABLE ONLY public.circles
    ADD CONSTRAINT circles_name_key UNIQUE (name);
ALTER TABLE ONLY public.reply_people
    ADD CONSTRAINT reply_people_reply_id_idx_key UNIQUE (reply_id, idx);
ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_circle_id_key UNIQUE (circle_id);
ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_token_key UNIQUE (token);
ALTER TABLE ONLY public.title_options
    ADD CONSTRAINT title_options_name_key UNIQUE (name);
ALTER TABLE ONLY public.seating_assignments
    ADD CONSTRAINT seating_assignments_person_type_person_id_key UNIQUE (person_type, person_id);
ALTER TABLE ONLY public.reception_tokens
    ADD CONSTRAINT reception_tokens_code_key UNIQUE (code);

ALTER TABLE ONLY public.guest_circles
    ADD CONSTRAINT guest_circles_circle_id_fkey FOREIGN KEY (circle_id) REFERENCES public.circles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.guest_circles
    ADD CONSTRAINT guest_circles_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES public.guests(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.replies_admin
    ADD CONSTRAINT replies_admin_matched_guest_id_fkey FOREIGN KEY (matched_guest_id) REFERENCES public.guests(id);
ALTER TABLE ONLY public.replies_admin
    ADD CONSTRAINT replies_admin_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES public.replies_admin(id);
ALTER TABLE ONLY public.reply_people
    ADD CONSTRAINT reply_people_reply_id_fkey FOREIGN KEY (reply_id) REFERENCES public.replies_admin(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_circle_id_fkey FOREIGN KEY (circle_id) REFERENCES public.circles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.seating_assignments
    ADD CONSTRAINT seating_assignments_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.seating_tables(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.reception_items
    ADD CONSTRAINT reception_items_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES public.guests(id) ON DELETE CASCADE;


-- ============================================================
-- インデックス
-- ============================================================

CREATE UNIQUE INDEX seating_grid_unique ON public.seating_tables USING btree (grid_row, grid_col) WHERE (grid_row IS NOT NULL);
CREATE UNIQUE INDEX seating_seat_unique ON public.seating_assignments USING btree (table_id, seat_index) WHERE (seat_index IS NOT NULL);
CREATE INDEX reception_items_guest_idx ON public.reception_items USING btree (guest_id);


-- ============================================================
-- トリガー
-- ============================================================

CREATE TRIGGER trg_sync_rsvp AFTER INSERT ON public.rsvp FOR EACH ROW EXECUTE FUNCTION public.trg_sync_rsvp();
CREATE TRIGGER trg_set_reception_id BEFORE INSERT ON public.guests FOR EACH ROW EXECUTE FUNCTION public.set_reception_id();
CREATE TRIGGER trg_touch_guests BEFORE UPDATE ON public.guests FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_touch_replies BEFORE UPDATE ON public.replies_admin FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_touch_parent AFTER INSERT OR UPDATE ON public.reply_people FOR EACH ROW EXECUTE FUNCTION public.touch_parent_reply();
CREATE TRIGGER trg_touch_people BEFORE UPDATE ON public.reply_people FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_touch_bs BEFORE UPDATE ON public.budget_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_touch_bi BEFORE UPDATE ON public.budget_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_touch_be BEFORE UPDATE ON public.budget_external FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_touch_es BEFORE UPDATE ON public.event_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_touch_st BEFORE UPDATE ON public.seating_tables FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_touch_sa BEFORE UPDATE ON public.seating_assignments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ============================================================
-- RLS 有効化
-- ============================================================

ALTER TABLE public.rsvp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replies_admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reply_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.title_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_external ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seating_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seating_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reception_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reception_tokens ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- ポリシー
-- ============================================================

CREATE POLICY "admin read" ON public.rsvp FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert only" ON public.rsvp FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "admin all" ON public.guests TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin all" ON public.circles TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin all" ON public.guest_circles TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin all" ON public.replies_admin TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin all" ON public.reply_people TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin all" ON public.change_log TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin all" ON public.share_links TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin all" ON public.title_options TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin all" ON public.budget_settings TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin all" ON public.budget_items TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin all" ON public.budget_external TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin all" ON public.event_settings TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin all" ON public.seating_tables TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin all" ON public.seating_assignments TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin all" ON public.reception_items TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin all" ON public.reception_tokens TO authenticated USING (true) WITH CHECK (true);


-- ============================================================
-- 権限（grant / revoke）
-- ============================================================

-- 表は Supabase 既定の grant（RLS で制御）。関数は anon から呼べるものを share_lookup と norm_name に限定している

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON FUNCTION public.gen_reception_id() TO anon;
GRANT ALL ON FUNCTION public.gen_reception_id() TO authenticated;
GRANT ALL ON FUNCTION public.gen_reception_id() TO service_role;
REVOKE ALL ON FUNCTION public.mark_superseded(p_id uuid, p_received timestamp with time zone, p_email text, p_fam text, p_giv text, p_fam_l text, p_giv_l text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_superseded(p_id uuid, p_received timestamp with time zone, p_email text, p_fam text, p_giv text, p_fam_l text, p_giv_l text) TO service_role;
GRANT ALL ON FUNCTION public.norm_name(t text) TO anon;
GRANT ALL ON FUNCTION public.norm_name(t text) TO authenticated;
GRANT ALL ON FUNCTION public.norm_name(t text) TO service_role;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;
REVOKE ALL ON FUNCTION public.seating_save(p_since_tables timestamp with time zone, p_since_asg timestamp with time zone, p_since_ev timestamp with time zone, p_del_tables uuid[], p_tables jsonb, p_moved_tables uuid[], p_del_asg uuid[], p_asg jsonb, p_moved_asg uuid[], p_ev jsonb, p_since_asg_count integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.seating_save(p_since_tables timestamp with time zone, p_since_asg timestamp with time zone, p_since_ev timestamp with time zone, p_del_tables uuid[], p_tables jsonb, p_moved_tables uuid[], p_del_asg uuid[], p_asg jsonb, p_moved_asg uuid[], p_ev jsonb, p_since_asg_count integer) TO authenticated;
GRANT ALL ON FUNCTION public.seating_save(p_since_tables timestamp with time zone, p_since_asg timestamp with time zone, p_since_ev timestamp with time zone, p_del_tables uuid[], p_tables jsonb, p_moved_tables uuid[], p_del_asg uuid[], p_asg jsonb, p_moved_asg uuid[], p_ev jsonb, p_since_asg_count integer) TO service_role;
GRANT ALL ON FUNCTION public.set_reception_id() TO anon;
GRANT ALL ON FUNCTION public.set_reception_id() TO authenticated;
GRANT ALL ON FUNCTION public.set_reception_id() TO service_role;
REVOKE ALL ON FUNCTION public.share_lookup(p_token text, p_password text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.share_lookup(p_token text, p_password text) TO anon;
GRANT ALL ON FUNCTION public.share_lookup(p_token text, p_password text) TO authenticated;
GRANT ALL ON FUNCTION public.share_lookup(p_token text, p_password text) TO service_role;
REVOKE ALL ON FUNCTION public.share_set_password(p_link uuid, p_password text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.share_set_password(p_link uuid, p_password text) TO authenticated;
GRANT ALL ON FUNCTION public.share_set_password(p_link uuid, p_password text) TO service_role;
GRANT ALL ON TABLE public.rsvp TO anon;
GRANT ALL ON TABLE public.rsvp TO authenticated;
GRANT ALL ON TABLE public.rsvp TO service_role;
REVOKE ALL ON FUNCTION public.sync_rsvp_row(r public.rsvp) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_rsvp_row(r public.rsvp) TO service_role;
REVOKE ALL ON FUNCTION public.touch_parent_reply() FROM PUBLIC;
GRANT ALL ON FUNCTION public.touch_parent_reply() TO service_role;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.touch_updated_at() TO service_role;
REVOKE ALL ON FUNCTION public.trg_sync_rsvp() FROM PUBLIC;
GRANT ALL ON FUNCTION public.trg_sync_rsvp() TO service_role;
GRANT ALL ON TABLE public.budget_external TO anon;
GRANT ALL ON TABLE public.budget_external TO authenticated;
GRANT ALL ON TABLE public.budget_external TO service_role;
GRANT ALL ON TABLE public.budget_items TO anon;
GRANT ALL ON TABLE public.budget_items TO authenticated;
GRANT ALL ON TABLE public.budget_items TO service_role;
GRANT ALL ON TABLE public.budget_settings TO anon;
GRANT ALL ON TABLE public.budget_settings TO authenticated;
GRANT ALL ON TABLE public.budget_settings TO service_role;
GRANT ALL ON TABLE public.change_log TO anon;
GRANT ALL ON TABLE public.change_log TO authenticated;
GRANT ALL ON TABLE public.change_log TO service_role;
GRANT ALL ON SEQUENCE public.change_log_id_seq TO anon;
GRANT ALL ON SEQUENCE public.change_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.change_log_id_seq TO service_role;
GRANT ALL ON TABLE public.circles TO anon;
GRANT ALL ON TABLE public.circles TO authenticated;
GRANT ALL ON TABLE public.circles TO service_role;
GRANT ALL ON TABLE public.event_settings TO anon;
GRANT ALL ON TABLE public.event_settings TO authenticated;
GRANT ALL ON TABLE public.event_settings TO service_role;
GRANT ALL ON TABLE public.guest_circles TO anon;
GRANT ALL ON TABLE public.guest_circles TO authenticated;
GRANT ALL ON TABLE public.guest_circles TO service_role;
GRANT ALL ON TABLE public.guests TO anon;
GRANT ALL ON TABLE public.guests TO authenticated;
GRANT ALL ON TABLE public.guests TO service_role;
GRANT ALL ON TABLE public.reception_items TO anon;
GRANT ALL ON TABLE public.reception_items TO authenticated;
GRANT ALL ON TABLE public.reception_items TO service_role;
GRANT ALL ON TABLE public.reception_tokens TO anon;
GRANT ALL ON TABLE public.reception_tokens TO authenticated;
GRANT ALL ON TABLE public.reception_tokens TO service_role;
GRANT ALL ON TABLE public.replies_admin TO anon;
GRANT ALL ON TABLE public.replies_admin TO authenticated;
GRANT ALL ON TABLE public.replies_admin TO service_role;
GRANT ALL ON TABLE public.reply_people TO anon;
GRANT ALL ON TABLE public.reply_people TO authenticated;
GRANT ALL ON TABLE public.reply_people TO service_role;
GRANT ALL ON TABLE public.seating_assignments TO anon;
GRANT ALL ON TABLE public.seating_assignments TO authenticated;
GRANT ALL ON TABLE public.seating_assignments TO service_role;
GRANT ALL ON TABLE public.seating_tables TO anon;
GRANT ALL ON TABLE public.seating_tables TO authenticated;
GRANT ALL ON TABLE public.seating_tables TO service_role;
GRANT ALL ON TABLE public.share_links TO anon;
GRANT ALL ON TABLE public.share_links TO authenticated;
GRANT ALL ON TABLE public.share_links TO service_role;
GRANT ALL ON TABLE public.title_options TO anon;
GRANT ALL ON TABLE public.title_options TO authenticated;
GRANT ALL ON TABLE public.title_options TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


-- ============================================================
-- Photo Toss 用（wedding-photos が使う表。管理画面は使わない）
-- ============================================================

-- ---------- photos ----------
-- Photo Toss：投稿写真・動画
CREATE TABLE public.photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    uploader_name text,
    kind text NOT NULL,
    original_key text NOT NULL,
    thumb_key text,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    width integer,
    height integer,
    duration_sec numeric,
    taken_at timestamp with time zone,
    lang text,
    upload_status text DEFAULT 'pending'::text NOT NULL,
    is_hidden boolean DEFAULT false NOT NULL,
    upload_id text,
    message text,
    batch_id uuid,
    device_id text,
    table_no text,
    content_hash text,
    medium_key text,
    CONSTRAINT photos_kind_check CHECK ((kind = ANY (ARRAY['image'::text, 'video'::text]))),
    CONSTRAINT photos_lang_check CHECK ((lang = ANY (ARRAY['ja'::text, 'zh'::text]))),
    CONSTRAINT photos_table_no_check CHECK ((table_no ~ '^[A-J]$'::text)),
    CONSTRAINT photos_upload_status_check CHECK ((upload_status = ANY (ARRAY['pending'::text, 'done'::text])))
);

-- ---------- votes ----------
-- Photo Toss：フォトコンテストの投票（1人1作品1票）
CREATE TABLE public.votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    photo_id uuid NOT NULL,
    voter_id text NOT NULL,
    voter_name text
);

-- ---------- awards ----------
-- Photo Toss：賞
CREATE TABLE public.awards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    name_ja text NOT NULL,
    name_en text NOT NULL,
    kind text DEFAULT 'manual'::text NOT NULL,
    manual_override boolean DEFAULT false NOT NULL,
    CONSTRAINT awards_kind_check CHECK ((kind = ANY (ARRAY['manual'::text, 'top_votes'::text])))
);

-- ---------- award_photos ----------
-- Photo Toss：賞と写真の対応
CREATE TABLE public.award_photos (
    award_id uuid NOT NULL,
    photo_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);

-- ---------- live_settings ----------
-- Photo Toss：会場スクリーンの設定（1行）
CREATE TABLE public.live_settings (
    id integer DEFAULT 1 NOT NULL,
    announce_mode boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    votes_enabled boolean DEFAULT true NOT NULL,
    music_file text,
    cue_file text,
    music_volume integer DEFAULT 80 NOT NULL,
    CONSTRAINT live_settings_id_check CHECK ((id = 1)),
    CONSTRAINT live_settings_music_volume_check CHECK (((music_volume >= 0) AND (music_volume <= 100)))
);

-- ---------- couple_messages ----------
-- Photo Toss：新郎新婦からのメッセージ
CREATE TABLE public.couple_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT couple_messages_text_check CHECK ((char_length(text) <= 36))
);

-- photos_ranked：写真に得票数を付けたビュー
CREATE VIEW public.photos_ranked AS
 SELECT p.id,
    p.created_at,
    p.uploader_name,
    p.kind,
    p.original_key,
    p.thumb_key,
    p.file_name,
    p.mime_type,
    p.size_bytes,
    p.width,
    p.height,
    p.duration_sec,
    p.taken_at,
    p.lang,
    p.upload_status,
    p.is_hidden,
    p.upload_id,
    p.message,
    p.batch_id,
    p.device_id,
    p.table_no,
    p.content_hash,
    p.medium_key,
    (COALESCE(v.n, (0)::bigint))::integer AS vote_count
   FROM (public.photos p
     LEFT JOIN ( SELECT votes.photo_id,
            count(*) AS n
           FROM public.votes
          GROUP BY votes.photo_id) v ON ((v.photo_id = p.id)));

ALTER TABLE ONLY public.photos
    ADD CONSTRAINT photos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.awards
    ADD CONSTRAINT awards_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.award_photos
    ADD CONSTRAINT award_photos_pkey PRIMARY KEY (award_id, photo_id);
ALTER TABLE ONLY public.live_settings
    ADD CONSTRAINT live_settings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.couple_messages
    ADD CONSTRAINT couple_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.photos
    ADD CONSTRAINT photos_original_key_key UNIQUE (original_key);
ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_one_per_photo UNIQUE (photo_id, voter_id);

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_photo_id_fkey FOREIGN KEY (photo_id) REFERENCES public.photos(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.award_photos
    ADD CONSTRAINT award_photos_award_id_fkey FOREIGN KEY (award_id) REFERENCES public.awards(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.award_photos
    ADD CONSTRAINT award_photos_photo_id_fkey FOREIGN KEY (photo_id) REFERENCES public.photos(id) ON DELETE CASCADE;

CREATE INDEX photos_device_idx ON public.photos USING btree (device_id);
CREATE INDEX photos_feed_idx ON public.photos USING btree (created_at DESC) WHERE ((upload_status = 'done'::text) AND (is_hidden = false));
CREATE UNIQUE INDEX photos_hash_unique ON public.photos USING btree (content_hash) WHERE ((upload_status = 'done'::text) AND (content_hash IS NOT NULL));
CREATE INDEX votes_photo_idx ON public.votes USING btree (photo_id);
CREATE INDEX votes_voter_idx ON public.votes USING btree (voter_id);

ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.award_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couple_messages ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.award_photos TO anon;
GRANT ALL ON TABLE public.award_photos TO authenticated;
GRANT ALL ON TABLE public.award_photos TO service_role;
GRANT ALL ON TABLE public.awards TO anon;
GRANT ALL ON TABLE public.awards TO authenticated;
GRANT ALL ON TABLE public.awards TO service_role;
GRANT ALL ON TABLE public.couple_messages TO anon;
GRANT ALL ON TABLE public.couple_messages TO authenticated;
GRANT ALL ON TABLE public.couple_messages TO service_role;
GRANT ALL ON TABLE public.live_settings TO anon;
GRANT ALL ON TABLE public.live_settings TO authenticated;
GRANT ALL ON TABLE public.live_settings TO service_role;
GRANT ALL ON TABLE public.photos TO anon;
GRANT ALL ON TABLE public.photos TO authenticated;
GRANT ALL ON TABLE public.photos TO service_role;
GRANT ALL ON TABLE public.votes TO anon;
GRANT ALL ON TABLE public.votes TO authenticated;
GRANT ALL ON TABLE public.votes TO service_role;
GRANT ALL ON TABLE public.photos_ranked TO anon;
GRANT ALL ON TABLE public.photos_ranked TO authenticated;
GRANT ALL ON TABLE public.photos_ranked TO service_role;


-- ============================================================
-- storage（ダンプに含まれないため、従来の記述を維持）
-- ============================================================

-- バケット rsvp-photos（非公開）。招待状フォームが anon で写真を PUT し、管理画面が署名付き URL で閲覧する。
-- バケット自体は Supabase ダッシュボードで作成済み（public=false）。
create policy "admin read photos" on storage.objects for select to authenticated using ((bucket_id = 'rsvp-photos'::text));
create policy "anon upload photos" on storage.objects for insert to anon with check ((bucket_id = 'rsvp-photos'::text));
