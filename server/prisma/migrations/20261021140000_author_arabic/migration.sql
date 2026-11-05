-- The author's own Arabic for a post and a form.
--
-- Posts and form titles were only ever machine-translated for a parent reading
-- in Arabic, and form field labels not at all. A consent form is a document a
-- school stands behind, so its Arabic should be the school's own words. When
-- present these are shown in place of the machine translation; field labels
-- carry theirs inside Form.fields (labelAr, optionsAr).
ALTER TABLE "Message" ADD COLUMN "titleAr" TEXT;
ALTER TABLE "Message" ADD COLUMN "contentAr" TEXT;
ALTER TABLE "Form" ADD COLUMN "titleAr" TEXT;
ALTER TABLE "Form" ADD COLUMN "descriptionAr" TEXT;
