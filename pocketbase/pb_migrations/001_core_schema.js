// House - Core schema: users, invite_keys, channels, messages, spaces, posts, comments, votes, polls
// Collections are created in dependency order because relations reference previous collection IDs.

migrate((app) => {
  const authRule = "@request.auth.id != ''";

  // -----------------------------------------------------------------
  // 1. users (auth) - PocketBase ships this collection; we extend it.
  //    Invite key based, no public signup (createRule null).
  // -----------------------------------------------------------------
  const users = app.findCollectionByNameOrId("users");
  users.listRule = authRule;
  users.viewRule = authRule;
  users.createRule = null;
  users.updateRule = "@request.auth.id = id || @request.auth.role = 'admin'";
  users.deleteRule = "@request.auth.role = 'admin'";

  const existing = {};
  try {
    const fl = users.fields.items();
    for (let i = 0; i < fl.length; i++) existing[fl[i].name] = true;
  } catch (err) {
    try {
      const fl = users.fields.all();
      for (let i = 0; i < fl.length; i++) existing[fl[i].name] = true;
    } catch (err2) {}
  }

  const addField = function (field) {
    if (existing[field.name]) return;
    users.fields.add(field);
    existing[field.name] = true;
  };

  addField(new TextField({ name: "username" }));
  addField(new TextField({ name: "role", required: true, max: 20 }));
  addField(new NumberField({ name: "karma" }));
  addField(new TextField({ name: "bio", max: 250 }));
  addField(new TextField({ name: "smash_main", max: 40 }));
  addField(new NumberField({ name: "roblox_id" }));
  addField(new DateField({ name: "last_active" }));
  addField(new FileField({
    name: "avatar",
    options: { maxSelect: 1, maxSize: 10485760, mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] },
  }));

  app.save(users);

  // -----------------------------------------------------------------
  // 2. invite_keys - server-only (admin creates, users redeem via custom endpoint)
  // -----------------------------------------------------------------
  const inviteKeys = new Collection({
    type: "base",
    name: "invite_keys",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: "@request.auth.role = 'admin'",
    fields: [
      { name: "key_code", type: "text", required: true, max: 64 },
      { name: "created_by", type: "relation", maxSelect: 1, collectionId: users.id },
      { name: "used_by", type: "relation", maxSelect: 1, collectionId: users.id },
      { name: "used_at", type: "date" },
      { name: "expires_at", type: "date" },
      { name: "is_used", type: "bool" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_invite_key ON invite_keys (key_code)",
    ],
  });
  app.save(inviteKeys);

  // -----------------------------------------------------------------
  // 3. channels - chat channels & DMs
  // -----------------------------------------------------------------
  const channels = new Collection({
    type: "base",
    name: "channels",
    listRule: authRule,
    viewRule: authRule,
    createRule: "@request.auth.role = 'admin'",
    updateRule: "@request.auth.role = 'admin'",
    deleteRule: "@request.auth.role = 'admin'",
    fields: [
      { name: "name", type: "text", required: true, max: 40 },
      { name: "description", type: "text", max: 200 },
      { name: "type", type: "select", required: true, values: ["channel", "dm"], maxSelect: 1 },
      { name: "icon", type: "text", max: 8 },
      { name: "is_pinned", type: "bool" },
      { name: "members", type: "relation", maxSelect: 100, collectionId: users.id },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_channel_name ON channels (name)",
    ],
  });
  app.save(channels);

  // -----------------------------------------------------------------
  // 4. messages - chat messages with threads, reactions, attachments
  // -----------------------------------------------------------------
  const messages = new Collection({
    type: "base",
    name: "messages",
    listRule: authRule,
    viewRule: authRule,
    createRule: authRule,
    updateRule: "@request.auth.id = user.id || @request.auth.role = 'admin'",
    deleteRule: "@request.auth.id = user.id || @request.auth.role = 'admin'",
    fields: [
      { name: "channel", type: "relation", required: true, maxSelect: 1, collectionId: channels.id, cascadeDelete: true },
      { name: "user", type: "relation", maxSelect: 1, collectionId: users.id },
      { name: "content", type: "editor" },
      { name: "attachments", type: "file", options: { maxSelect: 5, maxSize: 104857600, mimeTypes: [] } },
      { name: "reactions", type: "json" },
      { name: "mentions", type: "relation", maxSelect: 20, collectionId: users.id },
      { name: "is_pinned", type: "bool" },
      { name: "is_edited", type: "bool" },
    ],
  });
  app.save(messages);
  // self-referencing parent field must be added after the id is known
  messages.fields.add(new RelationField({ name: "parent", maxSelect: 1, collectionId: messages.id, cascadeDelete: true }));
  app.save(messages);

  // -----------------------------------------------------------------
  // 5. spaces - forum subreddit equivalents
  // -----------------------------------------------------------------
  const spaces = new Collection({
    type: "base",
    name: "spaces",
    listRule: authRule,
    viewRule: authRule,
    createRule: "@request.auth.role = 'admin'",
    updateRule: "@request.auth.role = 'admin'",
    deleteRule: "@request.auth.role = 'admin'",
    fields: [
      { name: "name", type: "text", required: true, max: 40 },
      { name: "description", type: "text", max: 300 },
      { name: "icon", type: "text", max: 8 },
      { name: "color", type: "text", max: 9 },
      { name: "rules", type: "json" },
      { name: "flairs", type: "json" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_space_name ON spaces (name)",
    ],
  });
  app.save(spaces);

  // -----------------------------------------------------------------
  // 6. posts - forum posts (text, link, media, poll)
  // -----------------------------------------------------------------
  const posts = new Collection({
    type: "base",
    name: "posts",
    listRule: authRule,
    viewRule: authRule,
    createRule: authRule,
    updateRule: "@request.auth.id = user.id || @request.auth.role = 'admin'",
    deleteRule: "@request.auth.id = user.id || @request.auth.role = 'admin'",
    fields: [
      { name: "space", type: "relation", required: true, maxSelect: 1, collectionId: spaces.id },
      { name: "user", type: "relation", maxSelect: 1, collectionId: users.id },
      { name: "title", type: "text", required: true, max: 150 },
      { name: "type", type: "select", required: true, values: ["text", "link", "media", "poll"], maxSelect: 1 },
      { name: "content", type: "editor" },
      { name: "url", type: "url" },
      { name: "media", type: "file", options: { maxSelect: 10, maxSize: 104857600, mimeTypes: [] } },
      { name: "flair", type: "text", max: 30 },
      { name: "upvotes", type: "number" },
      { name: "downvotes", type: "number" },
      { name: "comment_count", type: "number" },
      { name: "is_pinned", type: "bool" },
      { name: "is_locked", type: "bool" },
      { name: "is_deleted", type: "bool" },
    ],
  });
  app.save(posts);

  // -----------------------------------------------------------------
  // 7. comments - nested comments
  // -----------------------------------------------------------------
  const comments = new Collection({
    type: "base",
    name: "comments",
    listRule: authRule,
    viewRule: authRule,
    createRule: authRule,
    updateRule: "@request.auth.id = user.id || @request.auth.role = 'admin'",
    deleteRule: "@request.auth.id = user.id || @request.auth.role = 'admin'",
    fields: [
      { name: "post", type: "relation", required: true, maxSelect: 1, collectionId: posts.id, cascadeDelete: true },
      { name: "user", type: "relation", maxSelect: 1, collectionId: users.id },
      { name: "content", type: "editor", required: true },
      { name: "upvotes", type: "number" },
      { name: "downvotes", type: "number" },
      { name: "depth", type: "number" },
      { name: "is_deleted", type: "bool" },
    ],
  });
  app.save(comments);
  comments.fields.add(new RelationField({ name: "parent", maxSelect: 1, collectionId: comments.id }));
  app.save(comments);

  // -----------------------------------------------------------------
  // 8. votes - upvote/downvote records
  // -----------------------------------------------------------------
  const votes = new Collection({
    type: "base",
    name: "votes",
    listRule: authRule,
    viewRule: authRule,
    createRule: authRule,
    updateRule: "@request.auth.id = user.id",
    deleteRule: "@request.auth.id = user.id || @request.auth.role = 'admin'",
    fields: [
      { name: "user", type: "relation", required: true, maxSelect: 1, collectionId: users.id },
      { name: "post", type: "relation", maxSelect: 1, collectionId: posts.id, cascadeDelete: true },
      { name: "comment", type: "relation", maxSelect: 1, collectionId: comments.id, cascadeDelete: true },
      { name: "value", type: "number", required: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_vote_post ON votes (user, post)",
      "CREATE UNIQUE INDEX idx_vote_comment ON votes (user, comment)",
    ],
  });
  app.save(votes);

  // -----------------------------------------------------------------
  // 9. polls - attached to posts
  // -----------------------------------------------------------------
  const polls = new Collection({
    type: "base",
    name: "polls",
    listRule: authRule,
    viewRule: authRule,
    createRule: null,
    updateRule: "@request.auth.role = 'admin'",
    deleteRule: "@request.auth.role = 'admin'",
    fields: [
      { name: "post", type: "relation", required: true, maxSelect: 1, collectionId: posts.id, cascadeDelete: true },
      { name: "options", type: "json" },
      { name: "voters", type: "json" },
      { name: "ends_at", type: "date" },
    ],
  });
  app.save(polls);

  console.log("House core schema created (users, invite_keys, channels, messages, spaces, posts, comments, votes, polls)");
}, (app) => {
  const names = ["polls", "votes", "comments", "posts", "spaces", "messages", "channels", "invite_keys"];
  for (let name of names) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (e) {}
  }
  try { app.delete(app.findCollectionByNameOrId("users")); } catch (e) {}
});