-- Closes a gap that's existed since plot_rows.length_meters/spacing_meters
-- were added: those two columns had no write path at all -- authenticated
-- only ever held SELECT on plot_rows -- so no form was ever built for
-- them. This adds the third measurement a row actually needs (its
-- end-post count, alongside length and spacing) and, for the first time,
-- a real way for a producer to set all three themselves.

alter table public.plot_rows
  add column end_post_count int;

comment on column public.plot_rows.end_post_count is 'Number of end posts anchoring this row''s trellis. Nullable -- not every row has this recorded.';

-- Column-scoped from the start, not a table-level grant -- the
-- profiles.producer_id lesson earlier this project learned the hard way.
-- A producer can set a row's own measurements; nothing else about
-- plot_rows (plot_id, number) is writable from the client.
grant update (length_meters, spacing_meters, end_post_count) on public.plot_rows to authenticated;

-- plot_rows has no parcel_id of its own -- private.user_can_edit_parcel
-- (0025) resolves through plots.parcel_id, the same indirection
-- private.user_can_access_plot already uses for read access. Editor or
-- owner only; a viewer share can see a row's measurements but not set
-- them.
create policy "plot_rows: editor or owner can update their producer's rows"
  on public.plot_rows for update
  using (
    exists (
      select 1 from public.plots pl
      where pl.id = plot_rows.plot_id
        and private.user_can_edit_parcel(pl.parcel_id)
    )
  )
  with check (
    exists (
      select 1 from public.plots pl
      where pl.id = plot_rows.plot_id
        and private.user_can_edit_parcel(pl.parcel_id)
    )
  );
