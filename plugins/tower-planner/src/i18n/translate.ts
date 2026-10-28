// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { I18n, type I18nKeys } from "@chili3d/core";
import type { TowerI18nKey } from "./keys";

/** Translate a tower-planner key, keeping the plugin's key list type-checked. */
export function t(key: TowerI18nKey, ...args: unknown[]): string {
    return I18n.translate(key as I18nKeys, ...args);
}
