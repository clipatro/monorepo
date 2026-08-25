/**
 * Migration registry — add new migrations here in order.
 *
 * Each migration has a unique id (sequential number), a name, and SQL.
 * The migrator runs them in id order and tracks applied ones in _migrations.
 */

import { migration001 } from "./001-initial-schema.ts";
import { migration002 } from "./002-fts-and-story-novelty.ts";
import { migration003 } from "./003-channel-aspect-ratio.ts";
import { migration004 } from "./004-channel-approval-and-llm.ts";
import { migration005 } from "./005-channel-cost-toggles.ts";
import { migration006 } from "./006-channel-video-toggle.ts";
import { migration007 } from "./007-context-aware-characters.ts";
import { migration008 } from "./008-channel-video-template.ts";
import { migration009 } from "./009-multi-active-characters.ts";
import { migration010 } from "./010-video-templates.ts";
import { migration011 } from "./011-channel-background-audio.ts";
import { migration012 } from "./012-flow-scene-type.ts";

export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export function getMigrations(): Migration[] {
  return [
    migration001,
    migration002,
    migration003,
    migration004,
    migration005,
    migration006,
    migration007,
    migration008,
    migration009,
    migration010,
    migration011,
    migration012,
  ];
}
