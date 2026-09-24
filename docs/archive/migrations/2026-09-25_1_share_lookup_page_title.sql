-- a2: share_lookup が page_title を返すようにする。
-- 戻り値の型が変わるため drop → create → 権限の順で実行する。
-- 本体は schema-patch-share_lookup.sql の現行版と同じ（reply_people の本人行を使い、
-- 重複回答（superseded_by あり）は除外、ローマ字の姓→名で昇順）。挙動は変えていない。
-- シェアページ側は page_title が空なら「{友人圏名}のみなさま」を見出しにする（public/s/index.html）。

drop function if exists share_lookup(text, text);

create function share_lookup(p_token text, p_password text)
returns table (family_name text, given_name text, family_name_latin text, given_name_latin text,
               attending boolean, circle_name text, headline text, show_latin boolean,
               page_title text)
language plpgsql security definer as $$
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
      and ra.superseded_by is null          -- 重複回答は出さない
      and ra.attending is not null
    order by p.attending desc, p.family_name_latin, p.given_name_latin;
end $$;

revoke all on function share_lookup(text, text) from public;
grant execute on function share_lookup(text, text) to anon, authenticated;
