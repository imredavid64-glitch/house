// House - ensure every collection has created/updated autodate fields.
// PocketBase 0.40 no longer auto-adds these system fields to base/auth collections.

migrate((app) => {
  const colls = app.findAllCollections();
  for (let i = 0; i < colls.length; i++) {
    const c = colls[i];
    if (c.type === "view") continue;
    if (c.system) continue;
    if (typeof c.name === "string" && c.name.startsWith("_")) continue;
    let hasCreated = false;
    let hasUpdated = false;
    try {
      const fl = c.fields.items();
      for (let j = 0; j < fl.length; j++) {
        if (fl[j].name === "created") hasCreated = true;
        if (fl[j].name === "updated") hasUpdated = true;
      }
    } catch (e) {}
    if (!hasCreated) {
      c.fields.add(new AutodateField({ name: "created", onCreate: true, onUpdate: false }));
    }
    if (!hasUpdated) {
      c.fields.add(new AutodateField({ name: "updated", onCreate: true, onUpdate: true }));
    }
    app.saveNoValidate(c);
  }
  // backfill created timestamps for already-seeded records (channels, spaces, invite_keys leftovers)
  const backfill = function (collName, minutesAgo) {
    try {
      const coll = app.findCollectionByNameOrId(collName);
      const records = app.findRecordsByFilter(coll, "", "", 1000, 0);
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const cur = r.getDateTime("created");
        if (!cur || cur.isZero()) {
          r.set("created", new Date(Date.now() - minutesAgo * 60000).toISOString());
          app.saveNoValidate(r);
        }
      }
    } catch (e) {}
  };
  backfill("channels", 30);
  backfill("spaces", 30);
  backfill("invite_keys", 15);
  console.log("House autodate fields ensured (created/updated) and seeded timestamps backfilled.");
}, (app) => {
  // no-op down
});