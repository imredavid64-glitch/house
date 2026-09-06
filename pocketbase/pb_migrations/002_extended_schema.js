// House - Extended schema: news_items, notifications, storage, deletion voting, gaming data

migrate((app) => {
  const authRule = "@request.auth.id != ''";
  const adminRule = "@request.auth.role = 'admin'";

  const users = app.findCollectionByNameOrId("users");

  // -----------------------------------------------------------------
  // 10. news_items - cached news from external APIs
  // -----------------------------------------------------------------
  const newsItems = new Collection({
    type: "base",
    name: "news_items",
    listRule: authRule,
    viewRule: authRule,
    createRule: null,
    updateRule: null,
    deleteRule: adminRule,
    fields: [
      { name: "category", type: "select", required: true, values: ["gaming", "anime", "tech", "minecraft", "roblox", "smash"], maxSelect: 1 },
      { name: "title", type: "text", required: true, max: 250 },
      { name: "summary", type: "text", max: 600 },
      { name: "url", type: "url" },
      { name: "thumbnail_url", type: "url" },
      { name: "source_name", type: "text", max: 60 },
      { name: "metadata", type: "json" },
      { name: "published_at", type: "date" },
      { name: "fetched_at", type: "date" },
      { name: "expires_at", type: "date" },
    ],
    indexes: [
      "CREATE INDEX idx_news_category ON news_items (category)",
    ],
  });
  app.save(newsItems);

  // -----------------------------------------------------------------
  // 11. notifications - per-user in-app notifications
  // -----------------------------------------------------------------
  const notifications = new Collection({
    type: "base",
    name: "notifications",
    listRule: authRule,
    viewRule: "@request.auth.id = user.id",
    createRule: null,
    updateRule: "@request.auth.id = user.id",
    deleteRule: "@request.auth.id = user.id || @request.auth.role = 'admin'",
    fields: [
      { name: "user", type: "relation", required: true, maxSelect: 1, collectionId: users.id },
      { name: "type", type: "text", max: 30 },
      { name: "title", type: "text", max: 120 },
      { name: "body", type: "text", max: 400 },
      { name: "link", type: "text", max: 200 },
      { name: "is_read", type: "bool" },
    ],
  });
  app.save(notifications);

  // -----------------------------------------------------------------
  // 12. storage_files - metadata registry of every stored/compressed file
  // -----------------------------------------------------------------
  const storageFiles = new Collection({
    type: "base",
    name: "storage_files",
    listRule: authRule,
    viewRule: authRule,
    createRule: authRule,
    updateRule: authRule,
    deleteRule: authRule,
    fields: [
      { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id },
      { name: "source", type: "select", required: true, values: ["chat", "post", "avatar", "other"], maxSelect: 1 },
      { name: "record_id", type: "text", max: 50 },
      { name: "field", type: "text", max: 30 },
      { name: "original_name", type: "text", max: 200 },
      { name: "stored_name", type: "text", max: 200 },
      { name: "mime_type", type: "text", max: 80 },
      { name: "original_size", type: "number" },
      { name: "stored_size", type: "number" },
      { name: "algorithm", type: "select", values: ["none", "gzip", "webp"], maxSelect: 1 },
      { name: "category", type: "text", max: 20 },
      { name: "last_accessed", type: "date" },
    ],
  });
  app.save(storageFiles);

  // -----------------------------------------------------------------
  // 13. deletion_proposals - community voting on data deletion
  // -----------------------------------------------------------------
  const deletionProposals = new Collection({
    type: "base",
    name: "deletion_proposals",
    listRule: authRule,
    viewRule: authRule,
    createRule: authRule,
    updateRule: adminRule,
    deleteRule: adminRule,
    fields: [
      { name: "title", type: "text", required: true, max: 150 },
      { name: "description", type: "text", max: 600 },
      { name: "proposed_by", type: "relation", maxSelect: 1, collectionId: users.id },
      { name: "type", type: "select", required: true, values: ["old_files", "old_posts", "old_messages", "specific_files", "clear_cache"], maxSelect: 1 },
      { name: "criteria", type: "json" },
      { name: "estimated_freed_space", type: "number" },
      { name: "status", type: "select", required: true, values: ["voting", "approved", "rejected", "executed", "expired"], maxSelect: 1 },
      { name: "votes_yes", type: "number" },
      { name: "votes_no", type: "number" },
      { name: "voting_ends_at", type: "date" },
      { name: "executed_at", type: "date" },
      { name: "executed_by", type: "relation", maxSelect: 1, collectionId: users.id },
      { name: "freed_space", type: "number" },
    ],
  });
  app.save(deletionProposals);

  // -----------------------------------------------------------------
  // 14. deletion_votes
  // -----------------------------------------------------------------
  const deletionVotes = new Collection({
    type: "base",
    name: "deletion_votes",
    listRule: authRule,
    viewRule: authRule,
    createRule: authRule,
    updateRule: null,
    deleteRule: adminRule,
    fields: [
      { name: "proposal", type: "relation", required: true, maxSelect: 1, collectionId: deletionProposals.id, cascadeDelete: true },
      { name: "user", type: "relation", required: true, maxSelect: 1, collectionId: users.id },
      { name: "value", type: "number", required: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_delvote_proposal ON deletion_votes (proposal, user)",
    ],
  });
  app.save(deletionVotes);

  // -----------------------------------------------------------------
  // 15. app_settings - key/value settings (storage limit, quotas, etc.)
  // -----------------------------------------------------------------
  const appSettings = new Collection({
    type: "base",
    name: "app_settings",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "key", type: "text", required: true, max: 60 },
      { name: "value", type: "json" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_settings_key ON app_settings (key)",
    ],
  });
  app.save(appSettings);

  // -----------------------------------------------------------------
  // 16. smash_matches - internal friend group match tracking
  // -----------------------------------------------------------------
  const smashMatches = new Collection({
    type: "base",
    name: "smash_matches",
    listRule: authRule,
    viewRule: authRule,
    createRule: authRule,
    updateRule: "@request.auth.id = created_by.id || @request.auth.role = 'admin'",
    deleteRule: "@request.auth.id = created_by.id || @request.auth.role = 'admin'",
    fields: [
      { name: "player1", type: "relation", required: true, maxSelect: 1, collectionId: users.id },
      { name: "player2", type: "relation", required: true, maxSelect: 1, collectionId: users.id },
      { name: "winner", type: "relation", maxSelect: 1, collectionId: users.id },
      { name: "character1", type: "text", max: 40 },
      { name: "character2", type: "text", max: 40 },
      { name: "stage", type: "text", max: 40 },
      { name: "is_ranked", type: "bool" },
      { name: "created_by", type: "relation", maxSelect: 1, collectionId: users.id },
    ],
  });
  app.save(smashMatches);

  // -----------------------------------------------------------------
  // 17. mc_status - cached Minecraft server status
  // -----------------------------------------------------------------
  const mcStatus = new Collection({
    type: "base",
    name: "mc_status",
    listRule: authRule,
    viewRule: authRule,
    createRule: null,
    updateRule: null,
    deleteRule: adminRule,
    fields: [
      { name: "server_name", type: "text", max: 60 },
      { name: "host", type: "text", max: 120 },
      { name: "port", type: "number" },
      { name: "status", type: "select", values: ["online", "offline", "unknown"], maxSelect: 1 },
      { name: "player_count", type: "number" },
      { name: "max_players", type: "number" },
      { name: "version", type: "text", max: 40 },
      { name: "motd", type: "text", max: 200 },
      { name: "players", type: "json" },
      { name: "last_checked_at", type: "date" },
    ],
  });
  app.save(mcStatus);

  // -----------------------------------------------------------------
  // 18. roblox_games - cached Roblox game thumbnails/playercounts
  // -----------------------------------------------------------------
  const robloxGames = new Collection({
    type: "base",
    name: "roblox_games",
    listRule: authRule,
    viewRule: authRule,
    createRule: null,
    updateRule: null,
    deleteRule: adminRule,
    fields: [
      { name: "universe_id", type: "number", required: true },
      { name: "name", type: "text", max: 120 },
      { name: "description", type: "text", max: 400 },
      { name: "thumbnail_url", type: "url" },
      { name: "playing_count", type: "number" },
      { name: "creator", type: "text", max: 60 },
      { name: "last_updated_at", type: "date" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_roblox_universe ON roblox_games (universe_id)",
    ],
  });
  app.save(robloxGames);

  // -----------------------------------------------------------------
  // 19. deletion_log - audit trail for executions
  // -----------------------------------------------------------------
  const deletionLog = new Collection({
    type: "base",
    name: "deletion_log",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: adminRule,
    fields: [
      { name: "proposal", type: "relation", maxSelect: 1, collectionId: deletionProposals.id },
      { name: "action", type: "text", max: 40 },
      { name: "target_id", type: "text", max: 50 },
      { name: "target_type", type: "text", max: 30 },
      { name: "size_freed", type: "number" },
      { name: "executed_by", type: "relation", maxSelect: 1, collectionId: users.id },
    ],
  });
  app.save(deletionLog);

  console.log("House extended schema created (news_items, notifications, storage_files, deletion_proposals, deletion_votes, app_settings, smash_matches, mc_status, roblox_games, deletion_log)");
}, (app) => {
  const names = ["deletion_log", "roblox_games", "mc_status", "smash_matches", "app_settings", "deletion_votes", "deletion_proposals", "storage_files", "notifications", "news_items"];
  for (let name of names) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (e) {}
  }
});