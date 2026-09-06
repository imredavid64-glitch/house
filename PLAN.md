# 🏠 House - Exclusive Friend Social Platform

## Project Overview

**House** is an exclusive, self-hosted social media platform for a close group of friends, running on a Dell PC with PocketBase backend. It combines Reddit-style community posts, real-time chat, and curated content feeds (gaming, anime, tech news) with a 10GB storage limit and community-driven data management.

**Admin**: imredavid64@gmail.com  
**Platform**: Windows (Dell PC), PocketBase, Web-based frontend  
**Storage Limit**: 10GB (strict enforcement)

---

## 🏗️ Architecture

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Backend | PocketBase (Go) | Database, auth, real-time subscriptions, file storage |
| Frontend | React + Vite | Single-page application |
| Styling | Tailwind CSS | Responsive UI |
| State | Zustand | Lightweight state management |
| Real-time | PocketBase SSE | Live chat & updates |
| File Handling | gzip/brotli compression | Storage optimization |
| APIs | REST integrations | News, gaming data, rankings |

### Why PocketBase?

- Single binary, trivial to deploy on the Dell PC
- Built-in SQLite database (zero config)
- Real-time subscriptions via SSE
- Built-in auth, file storage, and REST API
- Admin dashboard included free
- Handles 10GB storage with custom hooks

### Project Structure

```
house/
├── pocketbase/              # PocketBase binary + data
│   ├── pb_data/            # SQLite + uploaded files (10GB cap)
│   └── pb_migrations/      # Schema migrations
├── server/                  # Go custom hooks (compression, limits)
│   ├── main.go
│   ├── hooks/
│   │   ├── compress.go      # Auto-compress files on upload
│   │   ├── storage.go       # 10GB limit enforcement
│   │   └── cleanup.go       # Scheduled cleanup jobs
│   └── apis/
│       ├── news.go          # News aggregation endpoints
│       ├── minecraft.go     # Minecraft server status
│       ├── roblox.go        # Roblox API proxy
│       └── smash.go         # Smash Bros rankings
├── frontend/                # React app
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout/
│   │   │   ├── Chat/
│   │   │   ├── Forum/
│   │   │   ├── News/
│   │   │   ├── Gaming/
│   │   │   ├── Admin/
│   │   │   └── Storage/
│   │   ├── hooks/
│   │   ├── stores/
│   │   ├── services/
│   │   └── utils/
│   └── public/
└── docker-compose.yml       # Optional containerization
```

---

## 👥 User System (Invite-Key Based)

### How Registration Works

No public signups. The admin creates invite keys, shares them with friends in person/DM. Each key is single-use and tied to one account.

### User Roles

| Role | Permissions |
|------|-------------|
| **Admin** (imredavid64@gmail.com) | Full access: create keys, manage storage, delete content, configure APIs, moderate everything |
| **Member** | Post, chat, vote, upload files, vote on deletion proposals |

### Registration Flow

```
1. Admin generates invite key (e.g., "HOUSE-ABCD-1234-EFGH")
2. Friend receives key via DM/IRL
3. Friend opens app → "Register" page
4. Enters key + chooses username + sets password
5. Key is consumed (marked used in DB)
6. Account created, user is logged in
```

### PocketBase Collections (Users)

```
users (built-in):
  - id
  - username (required, unique)
  - email (required, unique)
  - password (hashed)
  - avatar (file)
  - role: "admin" | "member"
  - created_at
  - last_active

invite_keys:
  - id
  - key_code (unique, indexed)
  - created_by (user ID)
  - used_by (user ID, nullable)
  - used_at (datetime, nullable)
  - expires_at (datetime, nullable)
  - is_used: bool
```

### Session Management

- PocketBase handles JWT auth automatically
- Sessions persist until logout
- Real-time connection tied to auth token
- Idle timeout: 30 days (configurable)

---

## 💬 Chat System (Google Chat Style)

### Design

Channels + DMs, threaded replies, @mentions, file attachments, reactions.

### Chat Channels

Pre-configured channels the admin can create:

```
#general        - Casual hangout
#gaming         - Game discussions
#anime          - Anime talk
#tech           - Tech news & discussion
#minecraft      - Minecraft server updates
#roblox         - Roblox updates
#smash          - Smash Bros rankings & matches
#off-topic      - Random stuff
#announcements  - Admin-only posting
```

### Chat Features

| Feature | Details |
|---------|---------|
| **Real-time messaging** | PocketBase SSE subscriptions, instant delivery |
| **Threads** | Reply to any message to create a thread (collapsible) |
| **@mentions** | Type @username to notify (in-app notification badge) |
| **Reactions** | Emoji reactions on any message (click to add) |
| **File sharing** | Drag-drop or click upload, auto-compressed |
| **Code blocks** | Syntax-highlighted code snippets for tech chat |
| **Markdown** | Basic markdown: **bold**, *italic*, `code`, > quote |
| **Edit/Delete** | Edit own messages within 15 min, delete anytime |
| **Search** | Full-text search across all channels |
| **Pinned messages** | Pin important messages per channel |

### Chat Data Model

```
channels:
  - id
  - name (unique)
  - description
  - type: "channel" | "dm"
  - created_by (user ID)
  - is_pinned: bool
  - member_ids: [user IDs] (for DMs)
  - created_at

messages:
  - id
  - channel_id (FK → channels)
  - user_id (FK → users)
  - content (text, compressed if > 10KB)
  - parent_id (FK → messages, for threads, nullable)
  - attachments: [file IDs]
  - reactions: JSON {emoji: [user IDs]}
  - mentions: [user IDs]
  - is_edited: bool
  - edited_at
  - is_pinned: bool
  - created_at

message_attachments:
  - id
  - message_id (FK → messages)
  - file_id (FK → _pb files)
  - original_name
  - compressed_size
  - uncompressed_size
  - mime_type
  - created_at
```

### Real-Time Implementation

```javascript
// Subscribe to channel messages
pb.collection('messages').subscribe('*', (e) => {
  if (e.action === 'create') {
    addMessageToUI(e.record);
  }
  if (e.action === 'update') {
    updateMessageInUI(e.record);
  }
  if (e.action === 'delete') {
    removeMessageFromUI(e.record.id);
  }
});
```

---

## 📋 Forum System (Reddit Style)

### Structure

Subcommunities called **"Spaces"** instead of subreddits.

### Pre-configured Spaces

```
🏠 General       - Anything goes
🎮 Gaming        - Game discussions, reviews, recommendations
📺 Anime         - Anime/manga discussion, recommendations
💻 Tech          - Tech news, setups, programming
🔨 Minecraft     - Server updates, builds, mods
🟩 Roblox        - Game updates, experiences, scripting
🥊 Smash Bros    - Tier lists, match analysis, frames
📰 News Roundup  - Aggregated news from all categories
🔧 Meta          - Feedback about House itself
```

### Post Features

| Feature | Details |
|---------|---------|
| **Text posts** | Markdown editor, code blocks, images inline |
| **Link posts** | URL with auto-preview (Open Graph scraping) |
| **Media posts** | Image/video/file uploads (auto-compressed) |
| **Polls** | Built-in polling with time limits |
| **Upvote/Downvote** | Reddit-style karma system |
| **Comments** | Nested/threaded comments (max 5 levels deep) |
| **Flairs** | Color-coded tags per Space (admin-configurable) |
| **Sort** | Hot, New, Top (day/week/month/all), Controversial |
| **Save** | Bookmark posts to personal saved list |
| **Share** | Copy link, share to chat channel |
| **Awards** | Fun emoji awards friends can give (custom) |

### Forum Data Model

```
spaces:
  - id
  - name (unique)
  - description
  - icon (emoji)
  - color (hex)
  - created_by (user ID)
  - member_count
  - rules: JSON
  - flairs: JSON [{name, color}]
  - created_at

posts:
  - id
  - space_id (FK → spaces)
  - user_id (FK → users)
  - title (required)
  - type: "text" | "link" | "media" | "poll"
  - content (text, nullable for link/media)
  - url (nullable, for link posts)
  - media_ids: [file IDs]
  - flair (nullable)
  - upvotes: int
  - downvotes: int
  - score (computed: upvotes - downvotes)
  - comment_count: int
  - is_pinned: bool
  - is_locked: bool
  - is_deleted: bool (soft delete)
  - created_at
  - updated_at

comments:
  - id
  - post_id (FK → posts)
  - user_id (FK → users)
  - parent_id (FK → comments, nullable, for nesting)
  - content (text)
  - upvotes: int
  - downvotes: int
  - depth: int (0-5)
  - is_deleted: bool
  - created_at
  - updated_at

votes:
  - id
  - user_id (FK → users)
  - post_id (FK → posts, nullable)
  - comment_id (FK → comments, nullable)
  - value: 1 | -1
  - created_at
  - UNIQUE(user_id, post_id)
  - UNIQUE(user_id, comment_id)

polls:
  - id
  - post_id (FK → posts)
  - options: JSON [{text, vote_count}]
  - voters: [user IDs]
  - ends_at (datetime, nullable = never)
  - created_at
```

### Karma System

- Each user has a karma score visible on profile
- +1 karma per upvote received on posts
- +1 karma per upvote received on comments
- -1 karma per downvote received
- Displayed as flair: `⬆ 234`

### Sorting Algorithm (Hot)

```
hot_score = (score - 1) / (hours_since_post + 2) ^ 1.8
```

This favors newer posts while letting quality rise.

---

## 📰 News & API Integrations

### News Feed Tabs

A dedicated "Feed" section with tabs for different news categories.

### 1. Gaming News

**Source**: IGN API, GameSpot RSS, Polygon RSS  
**Refresh**: Every 30 minutes  
**Storage**: Only store last 100 articles per source (auto-prune)

```
API Integration:
- GameSpot RSS: https://www.gamespot.com/feeds/mars_news/
- IGN RSS: https://feeds.feedburner.com/ign/all
- Polygon RSS: https://www.polygon.com/rss/index.xml

Display:
- Article title, thumbnail, source, published date
- Click to read full article (opens in-app webview or new tab)
- Vote to save article to "Bookmarks"
- Chat button to discuss article in real-time
```

### 2. Anime News

**Source**: MyAnimeList API, Anime News Network RSS  
**Refresh**: Every hour  

```
API Integration:
- Anime News Network: https://www.animenewsnetwork.com/encyclopedia/rss.xml
- MyAnimeList: Jikan API (https://api.jikan.moe/v4)

Features:
- Seasonal anime chart
- New episode alerts (track shows friends are watching)
- Anime recommendations based on MAL scores
- Discussion threads auto-created for new seasons
```

### 3. Tech News

**Source**: Hacker News API, TechCrunch RSS, Ars Technica RSS  
**Refresh**: Every 15 minutes  

```
API Integration:
- Hacker News API: https://hacker-news.firebaseio.com/v0/
- TechCrunch RSS: https://techcrunch.com/feed/
- Ars Technica: https://feeds.arstechnica.com/arstechnica/index

Features:
- Trending tech stories (HN top 30)
- Discussion threads auto-posted
- Upvote integration with forum
```

### 4. Minecraft Server Updates

**Source**: Minecraft server status + Mojang API  

```
Features:
- Live server status (online/offline, player count, version)
- MOTD display
- Player list (who's online now)
- Server announcement channel
- Version update alerts (new MC versions)
- Plugin/mod update notifications

API:
- Minecraft server query (port 25565)
- Mojang version manifest: https://launchermeta.mojang.com/mc/game/version_manifest.json
```

### 5. Roblox API Updates

**Source**: Roblox API + Roblox developer API  

```
Features:
- Popular games chart (top 20)
- Friend activity (which games friends are playing)
- Game update notifications for tracked games
- Developer blog updates
- Roblox status page integration

API:
- Roblox Games: https://games.roblox.com/v1/games
- Roblox Thumbnails: https://thumbnails.roblox.com
- Roblox Catalog: https://catalog.roblox.com/v1/search/items
```

### 6. Smash Bros Rankings

**Source**: Liquipedia, Start.gg API, Custom tracking  

```
Features:
- Global rankings (Liquipedia data)
- Tournament results feed
- Character tier list (community-voted)
- Match tracker (friends can log matches)
- Head-to-head records between friends
- Character main tracking

API:
- Start.gg: https://api.start.gg/gql/alpha (GraphQL)
- Liquipedia API: https://liquipedia.net/api.php
- Smash.gg data

Custom Features:
- "House Rankings" - internal ranking of friend group
- Weekly challenges
- Character loyalty badges
```

### News Feed Data Model

```
news_items:
  - id
  - category: "gaming" | "anime" | "tech" | "minecraft" | "roblox" | "smash"
  - title
  - summary (truncated)
  - url (original source)
  - thumbnail_url
  - source_name
  - source_icon
  - published_at
  - fetched_at
  - is_bookmarked_by: [user IDs]
  - discussion_post_id (FK → posts, nullable, for linked forum discussion)
  - metadata: JSON (extra data per category)
  - expires_at (auto-delete old articles)

minecraft_server:
  - id
  - server_name
  - ip_address
  - port
  - status: "online" | "offline"
  - player_count: int
  - max_players: int
  - version
  - motd
  - player_list: JSON
  - last_checked_at

tracked_games (Roblox):
  - id
  - game_id
  - game_name
  - thumbnail_url
  - playing_count
  - last_updated_at

smash_rankings:
  - id
  - player_name
  - character_main
  - wins: int
  - losses: int
  - rating: float
  - rank_position: int
  - last_updated_at

smash_matches:
  - id
  - player1_id (FK → users)
  - player2_id (FK → users)
  - player1_character
  - player2_character
  - winner_id (FK → users)
  - stage
  - is_ranked: bool
  - created_at
```

---

## 📁 File System & Compression

### Supported File Types

| Category | Extensions | Max Size |
|----------|-----------|----------|
| **Images** | jpg, jpeg, png, gif, webp, svg, bmp | 25MB |
| **Video** | mp4, webm, mov, avi | 100MB |
| **Audio** | mp3, wav, ogg, flac, aac | 50MB |
| **Documents** | pdf, doc, docx, txt, md, rtf | 25MB |
| **Archives** | zip, rar, 7z, tar, gz | 100MB |
| **Code** | .py, .js, .ts, .java, .cpp, .h, .cs, .go, .rs | 5MB |
| **Data** | json, csv, xml, yaml, sql | 10MB |
| **Other** | Any unrecognized extension | 10MB |

### Compression Strategy

All uploaded files are **automatically compressed** using the optimal algorithm:

```
Compression Decision Tree:
┌─────────────────────────┐
│ Is it already compressed?│
│ (jpg, png, mp4, mp3, zip)│
├─────────┬───────────────┤
│ YES     │ NO            │
│ Store   │ Compress with │
│ as-is   │ best algorithm│
└─────────┴───────────────┘

Compression Algorithms:
- Text/Code/JSON: gzip (85-95% reduction)
- Images: WebP conversion (30-50% reduction)
- Already compressed: Store as-is
- Archives: Store as-is (don't double-compress)
```

### Implementation (Go Hook)

```go
// Pseudocode for PocketBase hook
func OnFileUpload(file File) {
    // Skip if already compressed format
    if isCompressedFormat(file.Type) {
        return
    }
    
    // Apply gzip compression
    compressed := gzip.Compress(file.Data)
    
    // Only use compressed if smaller
    if len(compressed) < len(file.Data) {
        file.Data = compressed
        file.Meta["compressed"] = true
        file.Meta["original_size"] = len(file.Data)
    }
    
    // Check 10GB limit
    totalStorage := getTotalStorage()
    if totalStorage + len(file.Data) > 10GB {
        rejectUpload("Storage limit reached")
    }
}
```

### File Serving

- On download: auto-decompress if needed
- Stream large files (don't load entire file into memory)
- Cache headers for static assets
- Range requests for video/audio streaming

### Storage Tracking

Every file tracks:
- Original size
- Compressed size
- Compression ratio
- Upload date
- Last accessed date
- Referenced by (chat message, post, etc.)

---

## 💾 10GB Storage Management

### Storage Budget

```
Total Budget: 10GB
├── Database (SQLite):     ~500MB (generous for text data)
├── User Avatars:          ~200MB (50 users × 4MB avg)
├── Chat Attachments:      ~3GB
├── Forum Media:           ~3GB
├── News Cache:            ~200MB
├── System/Logs:           ~100MB
└── Buffer:                ~3GB
```

### Storage Enforcement

```
On Every Upload:
1. Calculate compressed size
2. Check current total: db.query("SELECT SUM(size) FROM files")
3. If (current + new) > 10GB → REJECT with warning
4. Show user: "X.XX GB / 10.0 GB used (XX.X%)"
```

### Admin Storage Dashboard

Accessible only to admin:

```
┌─────────────────────────────────────────┐
│ 📊 Storage Overview                      │
│ ████████████████░░░░░░░░░░ 6.2 GB / 10GB│
│                                          │
│ By Category:                             │
│ 📁 Chat Files:     2.1 GB  ████████░░░░ │
│ 📁 Forum Media:    1.8 GB  ██████░░░░░░ │
│ 📁 Avatars:        0.2 GB  █░░░░░░░░░░░ │
│ 📁 News Cache:     0.1 GB  █░░░░░░░░░░░ │
│ 📁 Database:       0.3 GB  █░░░░░░░░░░░ │
│ 📁 Other:          0.1 GB  █░░░░░░░░░░░ │
│                                          │
│ [Manage Storage] [View Largest Files]    │
└─────────────────────────────────────────┘
```

### Community Data Deletion Voting

**Purpose**: Let the community decide what old data to clean up.

#### How It Works

1. **Proposal Creation**:
   - Admin can auto-generate proposals based on storage analysis
   - Any member can create a deletion proposal
   - System auto-proposes: "Files older than 90 days in #general chat"

2. **Proposal Types**:

| Type | Example |
|------|---------|
| **Old Files** | "Delete chat files older than 60 days" |
| **Old Posts** | "Archive forum posts older than 180 days" |
| **Specific Files** | "Delete file X (150MB) uploaded by User Y" |
| **News Cache** | "Clear old news articles (keep last 7 days)" |
| **Chat History** | "Delete messages in #general older than 90 days" |

3. **Voting Process**:

```
Proposal Created
    ↓
72-hour voting window
    ↓
┌─────────────────────────────────┐
│  Requires 60% approval          │
│  Minimum 3 voters (or all if    │
│  group is small)                │
│  Admin has veto power           │
└─────────────────────────────────┘
    ↓
If Approved → Execute deletion → Log action
If Rejected → Archive proposal → No action
```

4. **Voting UI**:

```
┌─────────────────────────────────────────┐
│ 🗑️ Deletion Proposals                    │
│                                          │
│ [ACTIVE] Delete chat files > 60 days     │
│ Would free: ~450MB                       │
│ Votes: 👍 3 / 👎 1 (75% approval)       │
│ Time left: 2 days 14 hours               │
│ [Vote Yes] [Vote No] [View Files]        │
│                                          │
│ [ACTIVE] Clear old news cache            │
│ Would free: ~180MB                       │
│ Votes: 👍 1 / 👎 0 (100% approval)      │
│ Time left: 5 days                        │
│ [Vote Yes] [Vote No] [View Files]        │
│                                          │
│ [PAST] Archive #off-topic > 180 days     │
│ Result: ✅ Approved & Executed           │
│ Freed: ~2.3 GB                          │
└─────────────────────────────────────────┘
```

#### Data Deletion Model

```
deletion_proposals:
  - id
  - title
  - description
  - proposed_by (FK → users)
  - type: "old_files" | "old_posts" | "specific_files" | "clear_cache" | "chat_history"
  - criteria: JSON (age, category, specific IDs, etc.)
  - estimated_freed_space: bytes
  - status: "voting" | "approved" | "rejected" | "executed" | "expired"
  - votes_yes: int
  - votes_no: int
  - required_votes: int
  - voting_ends_at (datetime)
  - executed_at (datetime, nullable)
  - executed_by (FK → users)
  - freed_space: bytes (actual after execution)
  - created_at

deletion_votes:
  - id
  - proposal_id (FK → deletion_proposals)
  - user_id (FK → users)
  - value: 1 | -1
  - created_at
  - UNIQUE(proposal_id, user_id)

deletion_log:
  - id
  - proposal_id (FK → deletion_proposals)
  - action: "file_deleted" | "post_archived" | "cache_cleared"
  - target_id
  - target_type
  - size_freed: bytes
  - deleted_at
```

#### Auto-Proposal Rules (Admin-configurable)

```
Rule 1: If storage > 8GB → Auto-propose clearing old news cache
Rule 2: If storage > 9GB → Auto-propose deleting files > 90 days
Rule 3: If chat files > 3GB → Auto-propose cleaning old chat attachments
Rule 4: Monthly → Auto-create proposal for files > 180 days
```

---

## 🎨 UI/UX Design

### Layout

```
┌──────────────────────────────────────────────────────┐
│ 🏠 House    [Search...]    [🔔 3]  [👤 David ▼]     │
├──────────┬───────────────────────────────────────────┤
│          │                                           │
│ 🏠 Feed  │   Main Content Area                       │
│ 💬 Chat  │                                           │
│ 📋 Forum │   (Context-dependent based on             │
│ 📰 News  │    selected navigation item)              │
│ 🎮 Gaming│                                           │
│ 📊 Smash │                                           │
│ ⚙️ Admin │                                           │
│ 🗑️ Store │                                           │
│          │                                           │
├──────────┴───────────────────────────────────────────┤
│ Storage: ████████░░ 6.2GB / 10GB                     │
└──────────────────────────────────────────────────────┘
```

### Color Theme

```css
:root {
  --bg-primary: #1a1a2e;      /* Dark navy */
  --bg-secondary: #16213e;    /* Slightly lighter */
  --bg-card: #0f3460;         /* Card backgrounds */
  --accent: #e94560;          /* Hot pink accent */
  --accent-hover: #ff6b81;
  --text-primary: #ffffff;
  --text-secondary: #a0a0b0;
  --success: #2ed573;
  --warning: #ffa502;
  --danger: #ff4757;
  --border: #2a2a4a;
}
```

### Responsive Design

- **Desktop**: Full sidebar + content
- **Tablet**: Collapsible sidebar, 2-column layouts
- **Mobile**: Bottom navigation, swipeable panels
- **Minimum supported**: 320px width

### Key UI Components

1. **Notification Toast** - Slide-in notifications for new messages, mentions
2. **Floating Action Button** - Quick post/message creation
3. **Dark/Light Toggle** - System default dark, toggleable
4. **Emoji Picker** - For reactions, chat, posts
5. **Rich Text Editor** - Markdown with preview, toolbar
6. **File Preview** - Inline preview for images, video player, code viewer
7. **Progress Indicators** - Upload progress, storage usage

---

## 🔧 Additional Features

### 1. User Profiles

```
Profile includes:
- Avatar (uploaded, compressed)
- Display name
- Bio (250 chars max)
- Join date
- Karma score
- Roles/flairs
- Activity summary
- Smash Bros main character
- Currently playing (Roblox/MC)
- Last seen
- Posts & comments count
```

### 2. Notification System

```
Notification Types:
- New message in channel
- @mention in chat
- Reply to your post/comment
- Upvote on your post/comment
- New deletion proposal
- Storage warning
- Minecraft server online/offline
- Friend started playing a game

Delivery:
- In-app notification center (bell icon)
- Optional: Email notifications (configurable)
- Desktop notifications (browser API)
```

### 3. Activity Feed

```
Main "Feed" page shows:
- Recent chat highlights (popular messages)
- New forum posts (by friends)
- News articles (categorized)
- Gaming activity (who's playing what)
- Server status updates
- Storage warnings (if approaching limit)
```

### 4. Gaming Integration Details

#### Minecraft Integration

```
Features:
- Server status widget (always visible in sidebar)
- Player count history chart
- Automatic announcements when:
  - Server goes online/offline
  - New version available
  - Player milestones (100th player, etc.)
- Command to post server status: /mcstatus
- Screenshot sharing channel
```

#### Roblox Integration

```
Features:
- "Now Playing" widget showing friends' games
- Game recommendation algorithm based on:
  - Friends' play history
  - Trending games
  - User preferences
- Weekly "Top Games Among Friends" chart
- Game night scheduling tool
```

#### Smash Bros Tracker

```
Features:
- Personal stats dashboard
- Character win rates
- Monthly tournaments (friends only)
- Auto-generated highlight reels (text-based)
- "Fight of the Week" nomination
- Meta discussion channels per character
```

### 5. Search System

```
Global Search:
- Posts (title + content)
- Comments
- Chat messages
- Files (by name)
- Users
- News articles

Search Features:
- Filters: type, date range, author, space/channel
- Full-text search via SQLite FTS5
- Recent searches
- Search suggestions
```

### 6. Data Export

```
Admin can export:
- Full database backup (SQLite file)
- User data (GDPR-like compliance)
- Specific collections
- Chat history
- Forum posts with comments
- File inventory

Format: JSON, CSV, or SQLite dump
Storage: Exported to admin's download folder
```

### 7. Theme Customization

```
Per-user settings:
- Dark/Light mode
- Accent color picker
- Font size (small/medium/large)
- Compact/Comfortable view
- Notification sounds
- Animation preferences
```

### 8. Moderation Tools

```
Admin Tools:
- Delete any content
- Edit any content
- Ban users (disable account)
- Mute users (temporary restriction)
- Lock posts/threads
- Pin/unpin content
- Clear specific file categories
- Reset user passwords
- View all user activity logs
- Storage emergency tools

Auto-moderation:
- Spam detection (rate limiting)
- File type validation
- Storage limit enforcement
- Duplicate content detection
```

---

## 🚀 Deployment Plan

### Dell PC Setup

```bash
# 1. Install prerequisites
# Windows: Just need the PocketBase.exe binary

# 2. Create project directory
mkdir C:\House
cd C:\House

# 3. Download PocketBase
# Download from https://pocketbase.io/docs/

# 4. Create batch file to start
# start.bat
pocketbase.exe serve --http=0.0.0.0:8090

# 5. Create service (optional, for auto-start)
# Use NSSM or Windows Service
```

### Initial Setup Steps

```
1. Start PocketBase
2. Access admin dashboard: http://localhost:8090/_/
3. Create admin account: imredavid64@gmail.com
4. Set up database migrations (create collections)
5. Generate first batch of invite keys
6. Configure file storage settings
7. Set up API integrations (news feeds)
8. Deploy frontend build
9. Test with first friend
```

### Network Setup (Local Network)

```
Option 1: Local Network Only
- Access via: http://192.168.1.X:8090
- Only friends on same WiFi can access

Option 2: Tailscale (Recommended)
- Install Tailscale on Dell PC
- Each friend installs Tailscale
- Access via: http://house:8090
- Secure, no port forwarding needed

Option 3: Cloudflare Tunnel
- Free tier available
- Access via: house.yourdomain.com
- More complex setup, but works anywhere
```

### Backup Strategy

```
Daily: SQLite backup (copy pb_data/database.db)
Weekly: Full backup (entire pb_data folder)
Monthly: Export to external drive

Backup Location: D:\HouseBackups\
Storage: Keep last 30 days of backups
```

---

## 📋 Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Set up PocketBase on Dell PC
- [ ] Create database schema (migrations)
- [ ] Build user auth system (invite keys)
- [ ] Basic React frontend setup
- [ ] Admin dashboard
- [ ] File upload with compression

### Phase 2: Chat System (Week 3-4)
- [ ] Channel creation/management
- [ ] Real-time messaging
- [ ] Thread support
- [ ] Reactions & mentions
- [ ] File sharing in chat
- [ ] Search functionality

### Phase 3: Forum (Week 5-6)
- [ ] Space creation
- [ ] Post creation (text, link, media, poll)
- [ ] Comment system (nested)
- [ ] Voting system
- [ ] Sorting algorithms
- [ ] User profiles & karma

### Phase 4: News & APIs (Week 7-8)
- [ ] News feed aggregation
- [ ] Gaming news integration
- [ ] Anime news integration
- [ ] Tech news integration
- [ ] Minecraft server integration
- [ ] Roblox API integration
- [ ] Smash Bros rankings

### Phase 5: Storage Management (Week 9)
- [ ] Storage tracking dashboard
- [ ] Deletion proposal system
- [ ] Voting on proposals
- [ ] Auto-proposal rules
- [ ] Execution engine

### Phase 6: Polish (Week 10)
- [ ] UI/UX refinement
- [ ] Performance optimization
- [ ] Mobile responsiveness
- [ ] Testing & bug fixes
- [ ] Documentation
- [ ] Friend onboarding

---

## 🔐 Security Considerations

```
1. All traffic encrypted (HTTPS via Cloudflare or self-signed)
2. Invite keys are single-use, unpredictable (crypto.random)
3. Rate limiting on auth endpoints (prevent brute force)
4. File type validation (prevent malicious uploads)
5. SQL injection prevented (PocketBase parameterized queries)
6. XSS prevention (React auto-escapes, DOMPurify for markdown)
7. CSRF protection (PocketBase built-in)
8. Admin actions logged
9. Regular backups
10. 10GB limit prevents storage exhaustion attacks
```

---

## 📊 API Reference

### PocketBase Endpoints (Built-in)

```
Auth:
POST   /api/users/auth-via-email
POST   /api/users/refresh
POST   /api/users/logout

Collections:
GET    /api/collections/{name}/records
POST   /api/collections/{name}/records
GET    /api/collections/{name}/records/{id}
PATCH  /api/collections/{name}/records/{id}
DELETE /api/collections/{name}/records/{id}

Files:
GET    /api/files/{collection}/{id}/{filename}

Real-time:
GET    /api/realtime (SSE connection)
```

### Custom Endpoints (Go API)

```
News:
GET    /api/news/gaming
GET    /api/news/anime
GET    /api/news/tech
GET    /api/news/minecraft
GET    /api/news/roblox
GET    /api/news/smash

Gaming:
GET    /api/minecraft/status
GET    /api/roblox/popular
GET    /api/roblox/friends-playing
GET    /api/smash/rankings
GET    /api/smash/matches
POST   /api/smash/matches

Storage:
GET    /api/storage/overview
GET    /api/storage/largest-files
POST   /api/storage/propose-deletion
POST   /api/storage/vote/{proposalId}

Admin:
GET    /api/admin/invite-keys
POST   /api/admin/invite-keys
GET    /api/admin/stats
POST   /api/admin/export
```

---

## 🎯 Success Metrics

```
- All friends can register and use the platform
- Chat feels instant (< 100ms message delivery)
- News feeds update reliably
- Storage stays under 10GB
- Community actively votes on data management
- Minecraft/Roblox integrations provide real value
- Smash rankings are accurate and fun
- Platform is used daily by the friend group
```

---

## 📝 Notes

1. **Keep it simple** - This is for friends, not a startup. Don't over-engineer.
2. **Mobile-first** - Friends will mostly use phones.
3. **Fun over features** - Smash rankings and gaming integrations should feel playful.
4. **Community ownership** - The deletion voting makes everyone feel invested.
5. **Backup everything** - Dell PC could fail. Backups are critical.

---

**Last Updated**: 2026-09-06  
**Status**: Planning Complete  
**Next Step**: Begin Phase 1 Implementation
