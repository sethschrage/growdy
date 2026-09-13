# Data model

The full set of tables and how they relate. This complements
[`docs/decisions/`](decisions) rather than duplicating it: this page shows
the *structure*; the ADRs explain *why* specific choices within it were
made.

```mermaid
erDiagram
    PRODUCERS {
        uuid id PK
        text name
    }
    PROFILES {
        uuid id PK "also FK -> auth.users, Supabase-managed"
        uuid producer_id FK
    }
    PARCELS {
        uuid id PK
        uuid producer_id FK
        text name
    }
    PLOTS {
        uuid id PK
        uuid parcel_id FK
        uuid producer_id FK
        text name
    }
    PLOT_ROWS {
        uuid id PK
        uuid plot_id FK
        uuid producer_id FK
        int number
        numeric length_meters "nullable"
        numeric spacing_meters "nullable"
    }
    PLANTING {
        uuid id PK
        uuid producer_id FK
        uuid parcel_id FK
        uuid plot_id FK "nullable"
        uuid plot_row_id FK "nullable"
        int position "nullable"
        geography location "nullable"
        uuid variety_id FK "nullable"
        uuid scion_variety_id FK "nullable"
        uuid rootstock_variety_id FK "nullable"
        text nickname "nullable"
        text category "nullable"
        date planted_date "nullable"
        date dead_date "nullable"
        date removed_date "nullable"
        text removed_reason "nullable"
    }
    PLANT_TYPES {
        uuid id PK
        uuid proposed_by_producer_id FK "nullable"
        text name
        text kind
        text status
    }
    OBSERVATIONS {
        uuid id PK
        uuid planting_id FK
        uuid producer_id FK
        date observed_date "nullable"
        text note
        text photo_metadata "nullable"
        text status
        uuid conversation_id FK "nullable"
    }
    CONVERSATIONS {
        uuid id PK
        uuid producer_id FK
        text mode
        jsonb transcript
    }

    PRODUCERS ||--o{ PROFILES : "has members"
    PRODUCERS ||--o{ PARCELS : owns
    PARCELS ||--o{ PLOTS : "divided into"
    PLOTS ||--o{ PLOT_ROWS : contains
    PARCELS ||--o{ PLANTING : "located in"
    PLOTS |o--o{ PLANTING : "organizes (optional)"
    PLOT_ROWS |o--o{ PLANTING : "organizes (optional)"
    PLANTING ||--o{ OBSERVATIONS : "has"
    PLANT_TYPES |o--o{ PLANTING : "is variety for (optional)"
    PLANT_TYPES |o--o{ PLANTING : "is scion for (optional)"
    PLANT_TYPES |o--o{ PLANTING : "is rootstock for (optional)"
    PRODUCERS |o--o{ PLANT_TYPES : "proposed by (optional)"
    PRODUCERS ||--o{ CONVERSATIONS : "has chat sessions"
    CONVERSATIONS |o--o{ OBSERVATIONS : "led to (optional)"
```

## Reading this diagram

- **The hierarchy** (`producers > parcels > plots > plot_rows > planting`)
  is the backbone. `parcel_id` on `planting` is always required; `plot_id`
  and `plot_row_id` are only set for organized (gridded) plantings --
  see [0002](decisions/0002-planting-location-model.md).
- **`plant_types` is the one table that isn't producer-scoped.** It's a
  shared, global vocabulary -- `planting` references it three separate
  ways (`variety_id`, `scion_variety_id`, `rootstock_variety_id`)
  depending on whether a plant is own-rooted or grafted -- see
  [0004](decisions/0004-plant-types-kind-and-planting-columns.md).
- **`producer_id` is denormalized onto every table below `producers`**
  (not just reachable by joining up the chain), so RLS policies never
  need to walk the hierarchy to check access -- see
  [0001](decisions/0001-tenancy-membership-model.md). Those redundant
  `producer_id` columns exist on every table but aren't drawn as separate
  relationship lines here, to keep the diagram legible.
- **`position_status`** and **`planting_readable`** (views, not tables --
  see [0006](decisions/0006-planting-lifecycle-and-position-status.md))
  aren't shown above since they have no stored columns of their own;
  they're derived reads over `planting` and related tables.
- **`observations.status`** defaults to `pending` and only becomes
  `approved`/`rejected` after review -- see
  [0009](decisions/0009-chat-based-observation-submission.md).
- **`conversations`** is one row per chat session (`mode` is `submit` or
  `ask`, derived from whether the session produced a submission rather
  than fixed by an entry point the producer picked -- see
  [0012](decisions/0012-unified-chat-agent.md)), holding the full
  message transcript -- see [0011](decisions/0011-conversation-history.md).
  `observations.conversation_id`
  points back to the session a submission came from, when it came from
  the chat-based submission flow rather than a direct import; review
  follows that link to see the full exchange instead of a transcript
  duplicated onto the observation row itself.
- `auth.users` (Supabase-managed, not part of this project's own schema)
  isn't drawn as a full entity, but `profiles.id` is a foreign key into it.
