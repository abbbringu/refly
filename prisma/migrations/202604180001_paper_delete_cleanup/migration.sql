with ranked_paper_files as (
  select
    id,
    row_number() over (
      partition by paper_id
      order by created_at desc, id desc
    ) as row_num
  from public.paper_files
)
delete from public.paper_files
where id in (
  select id
  from ranked_paper_files
  where row_num > 1
);

create unique index if not exists paper_files_paper_id_unique_idx
  on public.paper_files (paper_id);

create or replace function public.delete_paper_storage_object()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if old.file_path is not null and old.file_path <> '' then
    delete from storage.objects
    where bucket_id = 'papers'
      and name = old.file_path;
  end if;

  return old;
end;
$$;

drop trigger if exists delete_paper_storage_object_trigger on public.paper_files;

create trigger delete_paper_storage_object_trigger
  after delete on public.paper_files
  for each row
  execute function public.delete_paper_storage_object();
