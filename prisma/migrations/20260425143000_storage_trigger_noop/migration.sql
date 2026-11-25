create or replace function public.delete_paper_storage_object()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  -- Storage objects must be deleted through the Storage API, not direct SQL.
  -- Keep this trigger as a no-op so cascading paper deletion cannot fail.
  return old;
end;
$$;
