-- Homepage hero can be a video (Admin → Homepage). The `images` bucket now
-- also takes MP4/WebM, and up to 50 MB a file (the free plan's ceiling);
-- photos are still shrunk in the browser before upload.
update storage.buckets
   set file_size_limit    = 52428800,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif',
                                  'video/mp4', 'video/webm']
 where id = 'images';
