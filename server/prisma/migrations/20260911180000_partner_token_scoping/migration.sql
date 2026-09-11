-- Scope a partner token to the routes and methods it actually needs.
--
-- Every partner token granted the whole surface. `requirePartner` resolved the
-- token, attached `req.partner`, and no route ever read it — so any valid token
-- could read staff↔parent correspondence, list every pupil with their
-- guardians, read a family's entire correspondence via the evidence route, read
-- private parent↔ILSA safeguarding threads, and broadcast to the school as any
-- staff member.
--
-- Empty arrays mean UNRESTRICTED, so every token minted before this keeps
-- working unchanged. New tokens should always be minted with both set.
ALTER TABLE "PartnerToken" ADD COLUMN "allowedPrefixes" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "PartnerToken" ADD COLUMN "allowedMethods"  TEXT[] NOT NULL DEFAULT '{}';
