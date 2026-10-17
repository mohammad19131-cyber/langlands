import type { Sector } from "@langlands/sim/public";
import type { DistrictId } from "../map/town-geometry";

/**
 * Representational mapping between the eight town-wide sectors and the map
 * districts where that work is concentrated. The simulation is town-wide — this
 * only drives where the board highlights an intervention's effort. It never
 * invents tile-level simulation effects.
 */
export const SECTOR_DISTRICTS: Record<Sector, DistrictId[]> = {
  restoration: ["wetlands", "hills", "river"],
  pollution_control: ["industry", "river"],
  water: ["river", "wetlands", "farms"],
  energy: ["grid", "industry"],
  agriculture: ["farms"],
  industry: ["industry"],
  infrastructure: ["neighbourhoods", "civic", "harbour"],
  public_services: ["civic", "neighbourhoods"],
};

/** Sectors whose work is concentrated in a given district. */
export function sectorsForDistrict(district: DistrictId): Sector[] {
  return (Object.keys(SECTOR_DISTRICTS) as Sector[]).filter((s) =>
    SECTOR_DISTRICTS[s].includes(district),
  );
}

export function districtsForSector(sector: Sector): DistrictId[] {
  return SECTOR_DISTRICTS[sector] ?? [];
}
