-- Public image endpoints sign private business-assets objects with the service
-- role. Keep the rows they consume inside the exact tenant feature folder so
-- a malformed row cannot publish another private object from the same salon.

alter table public.business_media
  drop constraint if exists business_media_path_business_prefix;

alter table public.business_media
  add constraint business_media_path_business_gallery
  check (
    path like (business_id::text || '/gallery/%')
    and position('..' in path) = 0
    and position(chr(92) in path) = 0
  ) not valid;

alter table public.staff
  add constraint staff_photo_url_business_staff_folder
  check (
    photo_url is null
    or photo_url ~* '^https?://'
    or (
      photo_url like (business_id::text || '/staff/%')
      and position('..' in photo_url) = 0
      and position(chr(92) in photo_url) = 0
    )
  ) not valid;

