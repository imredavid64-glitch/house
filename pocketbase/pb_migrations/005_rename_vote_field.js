migrate((app) => {
  const coll = app.findCollectionByNameOrId("deletion_votes");
  const oldField = coll.fields.getByName("value");
  if (oldField) {
    oldField.name = "choice";
    app.save(coll);
  }
  console.log("Renamed deletion_votes.value -> deletion_votes.choice");
}, (app) => {
  const coll = app.findCollectionByNameOrId("deletion_votes");
  const f = coll.fields.getByName("choice");
  if (f) {
    f.name = "value";
    app.save(coll);
  }
});
