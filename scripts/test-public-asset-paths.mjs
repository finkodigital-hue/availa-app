import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { isTenantAssetPathInFolder } from "../src/lib/safe-url.ts";

const tenantA = "00000000-0000-4000-8000-000000000001";
const tenantB = "00000000-0000-4000-8000-000000000002";

assert.equal(
  isTenantAssetPathInFolder(`${tenantA}/staff/person.jpg`, tenantA, "staff"),
  true,
  "staff signer accepts its own tenant's staff folder",
);
assert.equal(
  isTenantAssetPathInFolder(`${tenantA}/gallery/person.jpg`, tenantA, "staff"),
  false,
  "staff signer rejects a same-tenant gallery object",
);
assert.equal(
  isTenantAssetPathInFolder(`${tenantB}/staff/person.jpg`, tenantA, "staff"),
  false,
  "staff signer rejects another tenant's staff object",
);
assert.equal(
  isTenantAssetPathInFolder(
    `${tenantA}/staff/../gallery/person.jpg`,
    tenantA,
    "staff",
  ),
  false,
  "staff signer rejects traversal out of its feature folder",
);
assert.equal(
  isTenantAssetPathInFolder(`${tenantA}/gallery/salon.jpg`, tenantA, "gallery"),
  true,
  "gallery signer accepts its own tenant's gallery folder",
);
assert.equal(
  isTenantAssetPathInFolder(`${tenantA}/staff/salon.jpg`, tenantA, "gallery"),
  false,
  "gallery signer rejects a same-tenant staff object",
);
assert.equal(
  isTenantAssetPathInFolder(`${tenantB}/gallery/salon.jpg`, tenantA, "gallery"),
  false,
  "gallery signer rejects another tenant's gallery object",
);
assert.equal(
  isTenantAssetPathInFolder(
    `${tenantA}/gallery//salon.jpg`,
    tenantA,
    "gallery",
  ),
  false,
  "gallery signer rejects ambiguous empty path segments",
);

const db = new PGlite();
await db.exec(`
  create table public.business_media (
    id uuid primary key,
    business_id uuid not null,
    path text not null
  );
  create table public.staff (
    id uuid primary key,
    business_id uuid not null,
    photo_url text
  );
`);
const migration = await readFile(
  new URL(
    "../supabase/migrations/20260927008000_bind_public_image_paths_to_folders.sql",
    import.meta.url,
  ),
  "utf8",
);
await db.exec(migration);

let sequence = 10;
async function insertMedia(businessId, path) {
  sequence += 1;
  return db.exec(
    `insert into public.business_media(id,business_id,path) values ('00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}','${businessId}','${path}')`,
  );
}
async function insertStaff(businessId, photoUrl) {
  sequence += 1;
  const value = photoUrl === null ? "null" : `'${photoUrl}'`;
  return db.exec(
    `insert into public.staff(id,business_id,photo_url) values ('00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}','${businessId}',${value})`,
  );
}

await insertMedia(tenantA, `${tenantA}/gallery/salon.jpg`);
await assert.rejects(
  insertMedia(tenantA, `${tenantA}/staff/salon.jpg`),
  /business_media_path_business_gallery/,
);
await assert.rejects(
  insertMedia(tenantA, `${tenantB}/gallery/salon.jpg`),
  /business_media_path_business_gallery/,
);
await insertStaff(tenantA, `${tenantA}/staff/person.jpg`);
await insertStaff(tenantA, "https://images.example.test/person.jpg");
await insertStaff(tenantA, null);
await assert.rejects(
  insertStaff(tenantA, `${tenantA}/gallery/person.jpg`),
  /staff_photo_url_business_staff_folder/,
);
await assert.rejects(
  insertStaff(tenantA, `${tenantB}/staff/person.jpg`),
  /staff_photo_url_business_staff_folder/,
);

await db.close();
console.log("12 public image path boundary checks passed.");
