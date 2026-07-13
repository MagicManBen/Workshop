// Public configuration. The anon key is DESIGNED to be used in the browser and
// is safe to commit — Row Level Security controls all access. The service-role
// key is NEVER used here; it lives only on the always-on Mac print service.
window.WORKSHOP_CONFIG = {
  SUPABASE_URL: "https://dtjithnhunuwwrdnmhht.supabase.co",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0aml0aG5odW51d3dyZG5taGh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NjMyMTYsImV4cCI6MjA5MzEzOTIxNn0.l_6j2pG3OAV6h1UJQTStxGAzHNfQzlOUI3EE5K-7tDY",
  SCHEMA: "workshop",
  IMAGE_BUCKET: "workshop-images",
  // A heartbeat newer than this many seconds means the print service is online.
  HEARTBEAT_ONLINE_SECONDS: 45,
};
