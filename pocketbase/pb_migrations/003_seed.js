// House - Seed default data: channels, spaces, settings, and the app admin account.
// The app admin account uses the email imredavid64@gmail.com.
// Password comes from the HOUSEBASE_ADMIN_PASSWORD environment variable; if unset,
// a random password is generated and printed to the console once.

migrate((app) => {
  const getOrCreate = (name, data) => {
    try {
      return app.findFirstRecordByFilter(name, "name = {:name}", { name: data.name });
    } catch (e) {
      const rec = new Record(app.findCollectionByNameOrId(name));
      for (const k in data) rec.set(k, data[k]);
      app.save(rec);
      return rec;
    }
  };

  // ---- default chat channels ----
  const channelDefs = [
    { name: "general", description: "Casual hangout for the whole group", icon: "\u{1F3E0}", type: "channel", is_pinned: true },
    { name: "gaming", description: "Games in general, what to play, reviews", icon: "\u{1F3AE}", type: "channel", is_pinned: true },
    { name: "anime", description: "Anime & manga talk, recommendations", icon: "\u{1F4F9}", type: "channel", is_pinned: true },
    { name: "tech", description: "Tech news, setups, programming", icon: "\u{1F4BB}", type: "channel", is_pinned: true },
    { name: "minecraft", description: "MC server updates, builds, mods", icon: "\u26CF\uFE0F", type: "channel", is_pinned: true },
    { name: "roblox", description: "Roblox updates, experiences, scripting", icon: "\u{1F3D4}\uFE0F", type: "channel", is_pinned: true },
    { name: "smash", description: "Smash Bros rankings, matches, tier lists", icon: "\u{1F94A}", type: "channel", is_pinned: true },
    { name: "off-topic", description: "Anything goes", icon: "\u{1F4AC}", type: "channel", is_pinned: true },
    { name: "announcements", description: "Admin announcements (admin posts)", icon: "\u{1F4E2}", type: "channel", is_pinned: true },
  ];
  for (const def of channelDefs) getOrCreate("channels", def);

  // ---- default forum spaces ----
  const spaceDefs = [
    { name: "General", description: "Anything goes for the house", icon: "\u{1F3E0}", color: "#e94560", rules: ["Be kind", "No spam"] },
    { name: "Gaming", description: "Game discussions, reviews, recommendations", icon: "\u{1F3AE}", color: "#2ed573" },
    { name: "Anime", description: "Anime and manga discussions", icon: "\u{1F4F9}", color: "#ffa502" },
    { name: "Tech", description: "Tech news, setups, programming", icon: "\u{1F4BB}", color: "#1e90ff" },
    { name: "Minecraft", description: "Server updates, builds, mods", icon: "\u26CF\uFE0F", color: "#26de81" },
    { name: "Roblox", description: "Roblox experiences and scripting", icon: "\u{1F3D4}\uFE0F", color: "#ff4757" },
    { name: "Smash Bros", description: "Rankings, match analysis, tier lists", icon: "\u{1F94A}", color: "#ffdd59" },
    { name: "Meta", description: "Feedback and ideas about House itself", icon: "\u{1F527}", color: "#a29bfe" },
  ];
  for (const def of spaceDefs) getOrCreate("spaces", def);

  // ---- default settings ----
  const settings = [
    { key: "storage_limit_bytes", value: 10737418240 }, // 10 GB
    { key: "vote_window_hours", value: 72 },
    { key: "vote_approval_pct", value: 60 },
    { key: "vote_min_voters", value: 3 },
    { key: "auto_propose_at_bytes", value: 8589934592 }, // 8 GB
    { key: "news_ttl_minutes", value: 30 },
  ];
  for (const s of settings) {
    try {
      app.findFirstRecordByFilter("app_settings", "key = {:key}", { key: s.key });
    } catch (e) {
      const rec = new Record(app.findCollectionByNameOrId("app_settings"));
      rec.set("key", s.key);
      rec.set("value", s.value);
      app.save(rec);
    }
  }

  // ---- app admin account ----
  let admin;
  try {
    admin = app.findFirstRecordByFilter("users", "email = {:email}", { email: "imredavid64@gmail.com" });
  } catch (e) {
    admin = null;
  }
  if (!admin) {
    let pass = $os.getenv("HOUSEBASE_ADMIN_PASSWORD");
    if (!pass) {
      pass = $security.randomString(14);
      console.log("```````````````````````````````````````````````````");
      console.log("ADMIN ACCOUNT CREATED - imredavid64@gmail.com");
      console.log("TEMPORARY PASSWORD (set HOUSEBASE_ADMIN_PASSWORD to choose your own): " + pass);
      console.log("```````````````````````````````````````````````````");
    }
    admin = new Record(app.findCollectionByNameOrId("users"));
    admin.set("email", "imredavid64@gmail.com");
    admin.set("password", pass);
    admin.set("username", "david");
    admin.set("role", "admin");
    admin.set("karma", 0);
    app.save(admin);
  }

  console.log("House seed data ready (channels, spaces, settings, admin).");
}, (app) => {
  // down: nothing destructive to do automatically
});