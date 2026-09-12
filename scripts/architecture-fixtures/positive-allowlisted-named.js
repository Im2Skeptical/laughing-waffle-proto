// Scan-only architecture fixture. Not an app module. Do not import from src/.
// Virtual path is the allowlisted leftover importer.
import { syncSettlementDerivedState } from "../settlement-exec.js";
void syncSettlementDerivedState;
