ALTER TABLE "wedding_member" ADD CONSTRAINT "wedding_member_role_check" CHECK ("role" in ('owner', 'editor', 'viewer'));
