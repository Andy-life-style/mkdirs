import { defineField, defineType } from "sanity";

export default defineType({
  name: "replicaPage",
  title: "AIToolFame imported page",
  type: "document",
  fields: [
    defineField({
      name: "route",
      type: "string",
      validation: (r) => r.required(),
    }),
    defineField({ name: "title", type: "string" }),
    defineField({ name: "heading", type: "string" }),
    defineField({ name: "description", type: "text" }),
    defineField({ name: "pageType", type: "string" }),
    defineField({ name: "sourceUrl", type: "url", readOnly: true }),
    defineField({ name: "capturedAt", type: "datetime", readOnly: true }),
    defineField({ name: "text", type: "text" }),
    defineField({
      name: "html",
      type: "text",
      description:
        "Sanitized imported markup. Public assets are bundled locally; reference scripts are removed.",
    }),
    defineField({
      name: "imagePaths",
      type: "array",
      of: [{ type: "string" }],
    }),
    defineField({
      name: "imageAssets",
      title: "Imported images",
      type: "array",
      of: [{ type: "image" }],
    }),
  ],
  preview: { select: { title: "title", subtitle: "route" } },
});
