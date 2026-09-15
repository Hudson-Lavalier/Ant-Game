# Ant Game — FINAL Day / Night / Climate / Weather Update
## Canonical Setting: San Antonio–KM18 Cloud-Forest Plateau, Valle del Cauca, Colombia

**Status:** Final design specification for the Day / Night / Climate / Weather Update  
**Location basis:** Fictional locally flat mountain bench / plateau in the San Antonio–KM18 cloud-forest landscape on the eastern side of Colombia's Western Cordillera, overlooking the Cauca Valley.  
**Approximate elevation:** 1,900–2,000 m above sea level.

This document supersedes the earlier Spring/Summer/Fall/Winter version of the Day / Weather notes while preserving all still-relevant mechanics, hydrology ideas, weather hazards, audio, flood research, Evolution relationships, and creature research.

The central rule is:

> **Climate changes the world. It does not apply arbitrary universal buffs or debuffs to ants.**

---

# 1. Canonical Regional Climate

The game is based on a fictional locally flat forested bench in the **San Antonio / KM18 cloud-forest region** of Valle del Cauca.

Published San Antonio/KM18 research supports:

- cloud forest between roughly **1,800–2,200 m**
- annual mean temperatures reported around **15–18°C**, depending on study site and elevation
- annual precipitation reported around **~2,000–3,000 mm**
- very high humidity
- frequent fog / low cloud
- a strongly **bimodal rainfall regime**
- weak annual thermal seasonality compared with the Day/Night temperature cycle

For the fictional plateau, the game climate uses:

- **climatological temperature center:** about **17°C**
- **high humidity baseline:** generally around **85–95% RH**
- **rainfall target:** roughly **2,200–2,500 mm/year equivalent climate**
- **no temperate Spring/Summer/Fall/Winter**

These are game-site interpolations from nearby San Antonio/KM18 measurements, not a claim that a single weather station reports exactly those values.

---

# 2. Game Calendar

## Day / Night Cycle

- **Day:** 15 real minutes
- **Night:** 15 real minutes
- **Full game day:** 30 real minutes
- One full 30-minute game day represents **one calendar day**

## Calendar Start

Every new game begins:

- **January 1**

The calendar advances normally:

- January → February → March → ... → December → January

Month lengths follow the real calendar.

At 30 real minutes per game day:

- 31-day month = **15.5 real hours**
- 30-day month = **15 real hours**
- 28-day February = **14 real hours**
- 365-day climate year = **182.5 real hours**

This long calendar is intentional because the user chose to follow the real regional calendar rather than compress climate months.

---

# 3. Regional "Seasons"

The region does not use four thermal seasons.

The annual cycle is rainfall-driven:

## First Less-Rainy Period
**December–February**

Still humid and still rainy. "Less rainy" does not mean dry.

## First Wetter Period
**March–May**

Rain frequency climbs strongly.

- April and May are major rainfall peaks.

## Second Less-Rainy Period
**June–August**

Rain frequency falls.

- August is the strongest local rainfall minimum in the nearby Pichindé normal.

## Second Wetter Period
**September–November**

Rain returns strongly.

- October and November are major wet-period months.

The game may show month names directly while also storing these four rainfall phases internally.

---

# 4. Official Rain-Day Backbone

The nearby IDEAM **Pichindé** station provides an official 1991–2020 climatological normal for number of days with rain.

Station basis:

- Valle del Cauca / Cali mountain region
- elevation: about **1,637 m**
- period: **1991–2020**
- the fictional plateau is somewhat higher and cloudier, so these values are used as the empirical backbone rather than pretending they are exact measurements from the fictional site

| Month | Mean Rain Days | Approx. Chance a Calendar Day Is a Rain Day |
|---|---:|---:|
| January | 9.6 | 31.0% |
| February | 9.2 | 32.6% |
| March | 13.7 | 44.2% |
| April | 16.2 | 54.0% |
| May | 16.1 | 51.9% |
| June | 9.7 | 32.3% |
| July | 7.9 | 25.5% |
| August | 5.9 | 19.0% |
| September | 9.5 | 31.7% |
| October | 13.8 | 44.5% |
| November | 13.9 | 46.3% |
| December | 11.3 | 36.5% |
| **Annual** | **136.8** | **37.5%** |

These monthly probabilities replace the older arbitrary fixed Rain chance at Day/Night transitions.

---

# 5. Rain-Day Selection

At the beginning of each calendar day:

```text
rain_day_probability = current_month.rain_day_probability

if random() < rain_day_probability:
    today_is_rain_day = true
else:
    today_is_rain_day = false
```

A rain day does not mean that it rains continuously for the full 30-minute game day.

Instead, one or more rain events are scheduled within the day.

Wet-period months can naturally produce more frequent rain days because the real monthly probability is higher.

---

# 6. Real Rain Duration and Game Mapping

A 2026 analysis of hourly rainfall records in the CVC hydrometeorological network across Valle del Cauca catalogued **1,027 independent storms** and found:

- mean storm duration: **5.1 hours**
- mean storm depth: **19 mm**
- roughly **114 storms/year** in the analyzed record
- 2-year design-storm duration: **3.86 hours**
- longer rare events can persist much longer

CVC also documents real local examples:

- widespread Cali rain lasting about **2.5 hours**
- extreme convective event lasting about **40 minutes**
- a mesoscale convective system in Valle del Cauca lasting about **2 hours 20 minutes**
- a high-intensity event spanning roughly **1 hour**

Because one 24-hour calendar day equals 30 real game minutes:

- 5.1 real-world hours ≈ **6.4 game minutes**
- 2.5 hours ≈ **3.1 game minutes**
- 2 h 20 min ≈ **2.9 game minutes**
- 1 hour ≈ **1.25 game minutes**
- 40 min ≈ **0.8 game minutes**

## Final Rain-Duration Model

Rain duration should be variable rather than fixed.

### Ordinary / moderate rain
- typical: **3–8 game minutes**
- center around **~6 minutes**

### Short heavy / convective rain
- typical: **1–3 game minutes**

### Long persistent rain
- uncommon but possible: **8–12+ game minutes**

The rain-duration distribution should be weighted toward the ordinary regional storm scale, not uniform random.

---

# 7. Rain Timing During the Day

Valle del Cauca rainfall has a real diurnal pattern.

Regional hourly rainfall analysis identifies:

- an **afternoon intensity maximum around 15:00–16:00**
- a second nocturnal/early-morning maximum around **07:00**

CVC forecasts and observations also frequently describe stronger convection and thunderstorms in the **late afternoon, evening, and night**.

Therefore rain-event start times should not be uniformly random.

Conceptually:

```text
rain_start_weight:
    morning = possible
    midday = lower
    afternoon = high
    evening = high
    night / pre-dawn = moderate-high
```

Exact weighting can be tuned without changing the regional pattern.

---

# 8. Day / Night Is a World State, Not an Ant Debuff

The previous universal nighttime effects are removed.

There is:

- no universal player-ant movement penalty at Night
- no universal player-ant work penalty at Night
- no universal rival-ant slowdown at Night
- no universal harmful-creature slowdown at Night
- no mandatory Night hunger/thirst modifier
- no arbitrary seasonal ant-stat modifier

Real ant activity can be diurnal, nocturnal, crepuscular, or flexible depending on species and environmental conditions.

The generalized evolving player lineage therefore receives **no automatic Day/Night penalty or bonus**.

---

# 9. Underground Day / Night Visuals

The game is currently underground, so Day/Night should still be perceptible without pretending underground tunnels receive full outdoor lighting.

## General underground shader

- Day makes the underground scene **slightly brighter**.
- Night makes the underground scene **slightly darker**.
- The difference should remain subtle.
- No exact brightness percentage is required at the design level.

## Existing Surface-Hole Tiles

Existing surface-hole tiles should respond strongly:

### Day
- surface holes emit visible natural light into nearby underground space

### Night
- surface holes emit **zero natural daylight**

This gives the player a direct visual sense of Day/Night even before the full Surface Update exists.

---

# 10. Temperature System

Temperature is a world variable.

It must not change instantly at the Day/Night boundary.

It should move smoothly through a daily curve based on:

- calendar month
- time of day
- cloud cover
- rain
- fog
- small weather variability

## Regional temperature principle

San Antonio/KM18 has weak annual thermal seasonality.

Temperature therefore changes much more through the daily cycle than from January to July.

## Proposed monthly climate centers

These are game climatology targets synthesized from San Antonio/KM18 published annual means and the weak annual temperature cycle.

| Month | Mean Temperature Target |
|---|---:|
| January | 17.0°C |
| February | 17.1°C |
| March | 16.9°C |
| April | 16.7°C |
| May | 16.7°C |
| June | 17.0°C |
| July | 17.3°C |
| August | 17.5°C |
| September | 17.3°C |
| October | 16.9°C |
| November | 16.8°C |
| December | 16.9°C |

Wet/cloudier peak months are slightly cooler.

The less-rainy July–August interval allows somewhat stronger daytime warming.

## Daily temperature target

Ordinary game conditions at the fictional plateau should commonly move through approximately:

- cool Night / pre-dawn: **13–16°C**
- daytime: **17–21°C**
- occasional weather anomalies may go outside this ordinary range

The exact temperature at any moment should be interpolated smoothly.

Conceptual logic:

```text
monthly_center = climate_month.mean_temperature

daily_offset = smooth_time_of_day_curve()

cloud_offset = cloud_state.temperature_effect
rain_offset = rain_state.temperature_effect
weather_noise = slowly_varying_small_anomaly

target_temperature =
    monthly_center
    + daily_offset
    + cloud_offset
    + rain_offset
    + weather_noise

temperature approaches target_temperature smoothly
```

No ant is automatically debuffed because the temperature changed. Future species/Evolution logic may respond to actual temperature.

---

# 11. Humidity

Humidity is included now as a climate/world variable but is **benign for gameplay** in this update.

## Regional basis

San Antonio cloud-forest research has reported mean relative humidity around **91%** at a cloud-forest site.

The game should therefore feel persistently humid.

## World humidity target

Ordinary conditions:

- roughly **85–95% RH**

Fog / active rain:

- can approach **95–100% RH**

Clearer less-rainy daytime conditions:

- may fall into the low/mid 80s

## Important underground note

The current playable map is underground.

Tunnel/nest humidity is not assumed to equal exposed atmospheric RH exactly.

For this update:

- track the **regional/world RH**
- optionally display it
- do not give it direct ant effects
- do not overbuild a separate tunnel microclimate system yet

Future systems can distinguish surface air, soil moisture, and nest humidity if needed.

Conceptual logic:

```text
humidity_target =
    monthly_baseline
    + time_of_day_effect
    + cloud_effect
    + fog_effect
    + rain_effect

humidity approaches humidity_target smoothly
```

---

# 12. Cloud and Fog State

Cloud state should be tracked now, even though much of its future importance will arrive with the Surface Update.

Possible states:

- Clear
- Partly Cloudy
- Cloudy
- Fog / Low Cloud
- Rain
- Thunderstorm

San Antonio research specifically supports frequent fog / low cloud, often associated with moist Pacific air reaching the Western Cordillera and condensing near the ridge.

Cloud/fog can currently affect:

- ambient lighting
- temperature
- humidity
- rain generation context
- weather ambience

Future Surface Update effects may include visibility and direct surface lighting.

---

# 13. Weather-Generation Hierarchy

Weather is no longer selected from four unrelated fixed Day/Night-transition percentages.

The climate calendar controls Rain first.

## Step 1: Rain

Use the monthly rain-day probability.

If the day is selected as rainy, create one or more rain events.

## Step 2: Heavy Wind

For each rain event, Heavy Wind can be rolled as an additional layer.

Initial calibrated conditional chance:

- **45% chance that a rain event includes Heavy Wind**

This is a game calibration, not a directly measured San Antonio percentage.

It is intentionally high enough to represent the frequent convective/orographic weather of the region while not making every rain damaging.

## Step 3: Thunderstorm

Thunderstorm requires the Rain weather state and is rolled within rainy/convective weather.

To follow the requested hierarchy:

```text
Rain selected
    ↓
roll Heavy Wind
    ↓
if Heavy Wind succeeds:
    roll Thunderstorm
```

Initial conditional value:

- **65% Thunderstorm chance once Rain + Heavy Wind are present**

Combined:

- 0.45 × 0.65 ≈ **29% of rain events become thunderstorms**

### Scientific calibration basis

There is no clean San Antonio station table giving "percentage of rain events that contain thunder."

However:

- Colombia has very high lightning activity.
- the Cauca River Valley is a documented high-thunder region.
- a published study of mountainous Manizales found about **69 thunder days/year**
- nearby Pichindé has **136.8 rain days/year**

Using those as a regional mountain proxy gives roughly:

- 69 / 136.8 ≈ **50% thunder-day / rain-day ratio**

If a rainy day contains about two independent rain events, a **29% thunderstorm chance per rain event** gives:

- 1 - (1 - 0.29)^2 ≈ **50% chance of at least one thunderstorm on that rainy day**

Therefore the 45% Wind → 65% Thunderstorm chain is a game-calibrated way to approximately reproduce a high-lightning tropical mountain regime without falsely claiming a measured San Antonio event ratio.

---

# 14. Heavy Wind Duration

No high-quality San Antonio climatology giving a standalone "mean heavy-wind episode duration" was found.

Therefore Heavy Wind duration is inferred conservatively from documented Valle del Cauca convective events in which damaging/strong wind accompanied intense rain:

- 40-minute convective rain with gusts up to about 70 km/h
- ~1-hour torrential storm with strong wind and hail
- ~2 h 20 min mesoscale convective system

Mapped to the 30-minute game day:

## Final Heavy Wind duration

- typical: **1–3 game minutes**
- uncommon longer convective wind period: **up to ~4–5 minutes**

This is explicitly a regional-event-based game inference, not a measured standalone wind-duration normal.

---

# 15. Heavy Wind Cave-In Mechanic

While Heavy Wind is active:

- check approximately **once per minute**
- **5% chance per minute** of a cave-in

## Collapse size

- **3×3**

## Targeting

- select a random player-colony ant
- use that ant's general location
- choose nearby eligible excavated/open terrain

## Terrain result

Collapsed tiles become:

- **normal Dirt**

## Damage / destruction

Heavy Wind cave-ins can:

- destroy built tiles
- re-close excavated terrain
- trap or kill almost anything beneath the collapse

### Queen exception

A Heavy Wind cave-in must **never directly kill or bury a Queen**.

Any candidate collapse area that contains a Queen must be rejected/rerolled.

## Visibility

When open terrain becomes Dirt again:

- fog/visibility must update
- the player should no longer retain impossible vision through the newly closed terrain

---

# 16. Rain Underground Infiltration

Rain does not directly spawn a completed pool.

It creates an **invisible inflow source** into eligible underground open space.

The existing hydrology handles:

- spreading
- pooling
- draining
- rising water
- local water levels

## Targeting

When an underground Rain infiltration succeeds:

- select a random player-colony ant
- use the ant's general location as the area of interest
- choose nearby open/excavated space

Possible targets include:

- ordinary tunnels
- chambers
- Food Storage
- Spoil Storage
- other excavated areas

The flood is not restricted to unused rooms.

## Main volume

The established full Rain flood concept remains:

- approximately the equivalent of a **4×4 area at Level-7 water**
- delivered gradually rather than appearing instantly

## Inflow duration

The main inflow should pour in over approximately:

- **2 game minutes**

---

# 17. Rain Infiltration Probability

While Rain is actively falling:

- check once per minute
- initial underground infiltration chance: **5%**

After each successful infiltration during the **same individual Rain event**, subsequent opportunities become progressively less likely.

Use:

1. first success opportunity: **5%**
2. after one success: **3%**
3. after two: **1.5%**
4. after three: **0.75%**
5. after four: **0.375%**
6. after five: **0.1875%**
7. thereafter: **0.1% minimum floor**

The probability never falls below:

- **0.1%**

When that Rain event ends, the diminishing counter resets for the next separate Rain event.

## Continued rain

If the main 2-minute inflow finishes while Rain is still active:

- Rain may still produce another smaller inflow through the same diminishing-roll system.

Multiple underground infiltration events during one Rain event are therefore possible, but become increasingly rare.

---

# 18. Thunderstorm Duration

Thunderstorms are treated as the convective/electrical portion of a rainy event.

Regional examples include:

- ~1-hour high-intensity thunder/hail/wind episode
- ~2 h 20 min mesoscale convective system
- other short intense convective rainfall episodes

Mapped to the 30-minute game day:

## Final Thunderstorm duration

- typical active electrical phase: **1–3 game minutes**
- uncommon longer event: **4–5 game minutes**

The underlying Rain event can begin before the Thunderstorm phase and continue after it.

---

# 19. Thunderstorm Ambient Lightning

Thunderstorms should sound and look electrically active even when no world-interaction strike occurs.

During a Thunderstorm:

- periodic thunder can be heard
- visible lightning flashes may occur
- these ambient flashes do **not** damage terrain
- these ambient flashes do **not** create surface breaches
- they exist for ambience and weather communication

Ambient lightning/thunder should occur "every now and again" rather than on every simulation tick.

Separate `.ogg` assets should support:

- distant thunder
- nearby thunder
- destructive/world-interaction lightning strike

The actual destructive strike must sound substantially louder and more immediate than ambient lightning.

---

# 20. Destructive Lightning Strike

A Thunderstorm receives a separate chance for a lightning strike that physically interacts with the world.

## Check

While the Thunderstorm is active:

- check once per minute
- **2% chance** of a destructive strike

## Maximum destructive strikes

- **maximum 1 destructive/world-interaction strike per Thunderstorm**

After a destructive strike succeeds:

- destructive-strike probability for the remainder of that Thunderstorm becomes **0%**

Ambient audio/visual lightning can continue.

---

# 21. Lightning Breach

A destructive lightning strike:

- targets an already discovered / dug / marked area near the colony
- creates a new opening to the surface
- the opening becomes a permanent surface breach

The strike should use a separate loud lightning `.ogg`.

## Flood volume

The established Thunderstorm flood volume remains:

- **20–30 full Level-7 water tiles worth of water**

The amount is randomized within that range.

## Inflow time

The water enters over approximately:

- **1 game minute**

It is not spawned instantly.

---

# 22. Water-Capacity Rule for Lightning Floods

Current water tiles cap at:

- **Level 7**

The lightning-breach inflow does **not** guarantee that the full theoretical 20–30 tile-equivalent volume enters the map.

If the inflow is pouring into an area whose reachable receiving tiles are already at Level 7 and the existing hydrology cannot accept more water:

- the source shuts off
- unused event water is lost
- water is not queued
- water is not forced into unrelated tiles
- the game does not artificially exceed Level 7 to preserve the theoretical volume

The flood amount is therefore a **maximum opportunity**, not guaranteed stored water.

---

# 23. Permanent Surface Breach

After the Thunderstorm event water ends:

- the lightning-created breach remains open

In the future Surface Update:

- the breach becomes a real route through which later surface rain/water can enter the underground system

Until surface hydrology exists, the permanent hole remains as world geometry and a future-compatible connection.

---

# 24. Weather Overlap

Weather can overlap.

The system should use layered weather states rather than one mutually exclusive enum.

Possible combinations include:

- Rain only
- Rain + Heavy Wind
- Rain + Heavy Wind + Thunderstorm
- cloud/fog combined with other weather
- geological Earthquake occurring independently of any weather state

Thunderstorm is not an unrelated weather roll. It is a convective electrical escalation of rainy weather.

---

# 25. Earthquake Is Geological, Not Weather

Earthquake is preserved from the old design but removed from weather/climate probability tables.

It is:

- a separate **geological environmental event**
- not caused by Rain
- not caused by humidity
- not caused by Day/Night
- not caused by the monthly rainfall phase

Its occurrence system should remain separate from climate.

---

# 26. Earthquake Core Effect

Earthquake is the largest terrain-collapse event.

## Collapse shape

Final target footprint:

- approximately **15 blocks long**
- approximately **4 blocks wide**

The exact shape may be irregular rather than a perfect rectangle, but the affected stretch should be approximately this scale.

## Warning

Before terrain collapses:

- the screen/world should visibly shake

This gives the event a clear warning phase.

## Terrain

Affected open terrain becomes:

- **normal Dirt**

## Structures

Built tiles inside the selected collapse area are destroyed.

---

# 27. Earthquake Trapping and Suffocation

Entities caught beneath collapsing Dirt are not simply deleted.

They become:

- **trapped**

A trapped ant/creature:

- cannot move normally
- begins suffocating
- must be mined/rescued out before its suffocation timer expires
- dies if not freed in time

This creates a rescue consequence instead of an arbitrary instant kill.

Exact suffocation timing can use the game's existing survival timing architecture if available; this design does not create a new numeric timer without checking that system.

---

# 28. Absolute Queen Protection

A collapse event must **never target any tile occupied by any Queen**.

This applies to:

- Earthquake
- Heavy Wind cave-in

Selection logic:

```text
candidate_collapse_area = generate_area()

if candidate_collapse_area contains any Queen:
    reroll / choose another eligible area
else:
    apply collapse
```

The Queen is protected by excluding her occupied area from collapse targeting, not by burying her and making her magically invulnerable.

---

# 29. Weather Audio

The update should support externally supplied `.ogg` layers for:

- Rain ambience
- Heavy Wind ambience
- Thunderstorm ambience
- distant/ambient thunder
- ambient lightning
- destructive lightning strike
- Earthquake rumble / shaking

The files themselves will be supplied separately.

Audio should allow the player to perceive major weather while focused underground.

---

# 30. Creature Day/Night Research — Deferred for Surface Update

The following research remains preserved, but implementation is deliberately deferred.

The current game is underground, and several real diel behaviors are most meaningful when surface exposure, emergence, sheltering, or above-ground foraging exists.

Do **not** implement these creature Day/Night systems as part of this update.

## Earthworms

- *Lumbricus terrestris* shows strong nocturnal surface activity.
- This does not justify a generic underground Night speed buff.

Future Surface Update:
- Night/moisture may affect emergence or surface activity.

## Beetle Grubs

- no sufficiently general evidence supports a universal subterranean Day/Night modifier

Current:
- no modifier

## Isopods / Woodlice

- commonly nocturnal
- exposed activity is strongly related to desiccation/water balance
- evidence is strongest for surface/shelter behavior

Future Surface Update:
- humidity, shelter, and Night may affect exposed wandering

## Mites

- mites are too biologically diverse for one generalized Day/Night rule

Current:
- no modifier

## Spiders

- spider diel behavior is species-dependent
- nocturnal, crepuscular, and diurnal lineages exist

Current:
- previous arbitrary Night aggro reduction is removed
- a later Spider archetype can define diel behavior

## Boll Weevil

- circadian patterns in feeding, oviposition, and emergence are documented
- daytime bias is documented for some behaviors

Future:
- behavior may become time-dependent once surface ecology matters

## Hercules Beetle

- adult *Dynastes hercules* is crepuscular/nocturnal
- documented activity can peak before dawn

Current:
- previous reduced Night aggro rule is removed

Future Surface Update:
- Night/crepuscular emergence or activity may be added

## Root Aphids

- circadian physiology exists
- feeding can continue through both Day and Night

Current:
- no generic Day/Night feeding penalty

---

# 31. Rival Night Safeguard Removed

The entire old nighttime rival-colony safeguard is removed.

Deleted:

- 50% Night safeguard roll
- temporary +3 encounter allowance
- Night-based rival aggression forgiveness

The underlying rival aggression system remains, but Day/Night does not modify it.

---

# 32. Plant / Root / Aphid Seasonal Logic — Deferred

Climate effects on:

- roots
- plants
- Root Aphids
- food availability

are deliberately **tabbed for later**.

The climate system should expose the variables needed for those systems, but this update should not invent those ecology mechanics.

---

# 33. Soil Saturation — Deferred

Do not add a 0–100% soil-saturation simulation in this update.

Rainfall and hydrology are already sufficient for the current scope.

A future update may use:

- accumulated rainfall
- soil saturation
- infiltration
- drying

but this update should not overbuild that system.

---

# 34. Scientific Flood Inspiration Preserved

The existing flood mechanics remain inspired by real ant responses to inundation.

## Nest architecture

Ant nests can include:

- sloped shafts
- blind pockets
- drainage-like spaces
- chamber placement that reduces direct runoff exposure

## Soil treatment and wall stability

Ants can:

- pack soil
- manipulate fine particles
- use secretions during construction

Future Evolution may improve:

- wall stability
- infiltration resistance
- flood resilience

## Air pockets

Complex galleries can preserve trapped air during flooding.

This remains relevant to future flood-survival systems.

## Entrance sealing

Some ants alter/protect nest entrances using soil, debris, or nest material.

This remains a future flood-defense Evolution possibility.

---

# 35. Fire-Ant Rafting Inspiration Preserved

Flood-prone fire ants such as *Solenopsis invicta* can form cooperative rafts.

Relevant biological concepts:

- water-repellent body surfaces
- trapped air
- workers linking together
- brood and Queen protected within the raft structure

Rafting is not added in this update.

It remains a future Evolution/flood-survival mechanic.

---

# 36. Submersion Survival Inspiration Preserved

Ants do not necessarily die immediately when submerged.

Relevant biology includes:

- spiracles
- reduced activity/metabolism
- temporary low-oxygen tolerance
- species-specific submersion tolerance

No universal exact submersion time should be assumed for the generalized evolving ant lineage.

---

# 37. Relationship to Evolution Rework

Climate creates real environmental variables.

Future Evolution can change how the colony responds.

Potential future Evolution areas remain:

- flood-resistant nest architecture
- entrance sealing
- improved hydrophobicity
- rafting
- cold tolerance
- heat tolerance
- reduced desiccation
- improved drainage
- seasonal activity specialization
- diel activity specialization

Core rule:

> **World conditions first. Biological adaptation second.**

Do not hardcode:

```text
Night = -20% ant speed
Wet Season = +30% thirst
```

Instead:

```text
World temperature / humidity / water / light
        ↓
Ant biology + evolved traits
        ↓
Actual response
```

---

# 38. Final Climate / Weather State Model

A practical state object can contain:

```text
ClimateState
    calendar_day
    calendar_month
    rainfall_phase

    time_of_day
    day_progress

    temperature_c
    relative_humidity

    cloud_state
    fog_state

    rain_active
    rain_intensity
    rain_event_id
    rain_infiltration_success_count

    heavy_wind_active

    thunderstorm_active
    destructive_lightning_used

    earthquake_active
```

Earthquake remains logically separate from weather even if stored in the same high-level world-state service.

---

# 39. Final Daily Simulation Flow

```text
START CALENDAR DAY

1. Determine current month.

2. Load real monthly rain-day probability.

3. Roll whether this calendar day is a rain day.

4. Update monthly temperature center and humidity baseline.

5. Run continuous Day/Night:
      15 min Day
      15 min Night

6. Smoothly update:
      temperature
      humidity
      cloud/fog
      underground ambient brightness
      surface-hole daylight

7. If rain day:
      schedule one or more rain events
      weight event times toward regional rainfall peaks

8. For each Rain event:
      choose duration
      roll Heavy Wind (45%)

9. If Heavy Wind:
      choose wind duration
      run 5%/minute cave-in checks
      roll Thunderstorm (65%)

10. If Thunderstorm:
      choose 1–3 min typical duration
      play ambient thunder/lightning
      check 2%/minute for one destructive strike

11. While Rain:
      check underground infiltration once/minute
      use 5% → 3% → 1.5% → ... → 0.1% floor
      successful main inflow lasts about 2 min

12. If destructive lightning succeeds:
      create permanent breach
      pour 20–30 Level-7-tile-equivalent water over 1 min
      stop early if reachable water capacity is full

13. Earthquake:
      handled independently by geological-event logic
      never target Queen-occupied area

END CALENDAR DAY
advance calendar date
```

---

# 40. Scientific Confidence and Game-Abstraction Boundary

## Directly supported / strongly grounded

- San Antonio/KM18 cloud-forest setting
- 1,800–2,200 m cloud-forest elevation belt
- cool annual mean temperature
- very high humidity
- weak annual temperature seasonality
- bimodal rainfall regime
- wetter March–May and September–November
- drier June–August
- nearby official monthly rain-day counts
- frequent cloud/fog
- afternoon/evening/night convective importance
- regional storms lasting from under an hour to several hours
- mean regional storm duration around 5.1 h in one recent CVC-network analysis
- strong lightning activity in Colombia and the Cauca Valley
- Earthquake being geological, not meteorological

## Research-informed game interpolation

- fictional plateau center near 17°C
- 85–95% ordinary RH
- monthly mean-temperature table
- ordinary Rain duration 3–8 game min
- Heavy Wind duration 1–3 game min
- Thunderstorm electrical phase 1–3 game min
- 45% Rain→Heavy Wind conditional roll
- 65% Wind→Thunderstorm conditional roll
- combined ~29% thunderstorm-per-rain-event target

## Explicit gameplay mechanics

- 5%/minute underground Rain infiltration
- diminishing Rain-infiltration sequence
- 2-minute Rain inflow
- 5%/minute Heavy Wind cave-in
- 3×3 cave-ins
- 2%/minute destructive lightning
- one destructive strike maximum per Thunderstorm
- 20–30 Level-7 tile-equivalent lightning flood
- 1-minute lightning inflow
- 15×4 approximate Earthquake collapse
- trapped/suffocating collapse victims
- Queen exclusion from collapse targeting
- subtle underground Day/Night shader shift

These mechanics are designed to remain compatible with the real climate without falsely presenting every gameplay percentage as a measured natural statistic.

---

# 41. Sources

## Official Colombian climate / weather

IDEAM — Standard climatological normals 1991–2020  
https://ideam.gov.co/sala-de-prensa/informes/publicacion-jue-08052025-1200

IDEAM — Climatological Atlas of Colombia  
https://www.ideam.gov.co/AtlasWeb/

IDEAM — Hydrometeorological data system  
https://ideam.gov.co/dhime

IDEAM — Weather radar data guide  
https://www.ideam.gov.co/nuestra-entidad/servicio-de-pronosticos-y-alertas/guia-de-descarga-y-visualizacion-de-datos-de-radar-meteorologico-de-ideam

## Valle del Cauca / CVC

CVC — regional hydroclimatological portal  
https://portal-hidroclimatologico.cvc.gov.co/

CVC — March 31, 2025 generalized Cali rainfall, ~2.5 h / 40 mm  
https://www.cvc.gov.co/primera-temporada-lluvias

CVC — February 19, 2026 torrential rainfall with hail, strong winds, lightning  
https://www.cvc.gov.co/lluvias-cali-19-febrero-2026

CVC — May 4, 2026 mesoscale convective system, ~14 mm in 10 min and ~2 h 20 min event window  
https://www.cvc.gov.co/lluvias-versalles-mayo-4-2026

CVC — March 19, 2021 extreme Cali rain, 53 mm in 40 min with gusts up to ~70 km/h  
https://www.cvc.gov.co/2021070

CVC — regional thunderstorm / ITCZ explanation  
https://www.cvc.gov.co/carousel/1645-precaucion-por-tormentas-electricas

## Storm duration

Victoria, M. (2026), *Design storm duration from hourly rainfall records in a bimodal Andean climate*  
https://engrxiv.org/preprint/view/7062

Key reported results used here:
- 1,027 independent storms
- mean depth 19 mm
- mean duration 5.1 h
- bimodal seasonal clustering
- afternoon and nocturnal rainfall maxima

This is a recent preprint rather than a final peer-reviewed paper, so it is used as a quantitative regional duration basis together with CVC's documented observed events.

## Lightning / thunderstorms

Díaz, Ortiz & Román (2022), *Lightning climatology in Colombia*, Theoretical and Applied Climatology  
https://link.springer.com/article/10.1007/s00704-022-04012-9

Herrera et al. (2018), *Cloud-to-ground lightning activity in Colombia: A 14-year study using lightning location system data*  
https://www.sciencedirect.com/science/article/abs/pii/S0169809517304283

Del Río-Trujillo et al. — mountain-city lightning study; Manizales averaged ~69 thunder days/year  
https://revistas.uis.edu.co/index.php/revistauisingenierias/article/view/10565

Albrecht et al. (2016), *Where Are the Lightning Hotspots on Earth?*  
https://doi.org/10.1175/BAMS-D-14-00193.1

## San Antonio / KM18 cloud forest

San Antonio forest research, 1,800–2,200 m / cool wet cloud forest  
https://pmc.ncbi.nlm.nih.gov/articles/PMC3011900/

La Florida, San Antonio/KM18 cloud-forest site  
https://portal.amelica.org/ameli/journal/433/4335282003/html/

## Creature Day/Night research retained for later Surface Update

Earthworm nocturnal surface activity  
https://pmc.ncbi.nlm.nih.gov/articles/PMC12205020/

Isopod activity / sheltering  
https://pmc.ncbi.nlm.nih.gov/articles/PMC11822361/

Spider diel behavior example  
https://pmc.ncbi.nlm.nih.gov/articles/PMC8612999/

Boll weevil circadian behavior  
https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1744-7917.2006.00116.x

Hercules beetle biology / crepuscular-nocturnal activity  
https://ask.ifas.ufl.edu/publication/IN1142

Aphid feeding/circadian physiology  
https://pubmed.ncbi.nlm.nih.gov/32240579/

---

# 42. Final Design Summary

The final update is no longer:

> generic Day/Night penalties + arbitrary Spring/Summer/Fall/Winter modifiers.

It is:

**A real San Antonio/KM18 cloud-forest calendar and weather simulation.**

The game tracks:

- real calendar date beginning January 1
- 30-minute game days
- real monthly rain-frequency pattern
- two wetter and two less-rainy periods
- smooth Day/Night temperature
- high cloud-forest humidity
- cloud and fog
- regionally grounded rain duration
- layered Rain → Heavy Wind → Thunderstorm escalation
- underground rain infiltration
- destructive lightning breaches
- persistent surface holes
- cave-ins
- separate geological Earthquakes
- subtle underground light response to Day/Night
- future-compatible climate variables for Surface and Evolution updates

Ants are not arbitrarily buffed or debuffed by the clock.

The environment changes first. Biology responds only when research and later Evolution systems justify that response.
