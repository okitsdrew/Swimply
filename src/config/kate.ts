import { defineConfig } from './store';

// Kate Lamity, the kitchen's chef and the first castle boss. She holds the stolen fire butterfly, which circles her.
// She walks at the player and has three attacks:
//   Pan Strike (when he is within strikeRange): she dashes in to stop strikeGap short of him, winds up, and swings her
//     giant pan round her from her left to her right. Only the pan itself hurts, as it passes.
//   Fire Slap (when he is further, up to slapRange): the butterfly flies in front of her, she slaps it with the same
//     swing, and two fireballs curve out to where he stood and come back to her. She hops sideways and slaps again,
//     slapShots times in all.
//   Fire Slam (on its own cooldown, first when ready): she leaps at him and smashes down, and a ring of fire spreads
//     from where she lands to the walls.
export const kate = defineConfig(
  'kate',
  'bosses',
  {
    hp: 3000,
    // How much of a stun, freeze, slow or burn she shrugs off: 0 takes it all, 1 is immune.
    ccResist: 0.5,
    // How much of a push (a blast's knockback) moves her, 0 to 1, and how fast it dies away.
    knockbackTaken: 0.2,
    knockbackDecay: 8,
    speed: 350,
    uniformScreenSpeed: true,
    turnRate: 6,
    // Body circle at scale 1; it grows with scale. The player dies when his hit circle meets contactScale of it.
    radius: 18,
    scale: 1.5,
    contactScale: 0.8,
    // Seconds her spawn mark shows before she rises (when spawned, not placed).
    spawnTell: 1.5,
    walkFps: 6,
    dashFps: 30,
    // Seconds after an attack before she picks the next one.
    attackCooldown: 0.8,
    // Pan Strike: within strikeRange she dashes at dashSpeed to stop strikeGap short of him (at most strikeDashMax).
    strikeRange: 450,
    strikeGap: 60,
    strikeDashMax: 500,
    dashSpeed: 1800,
    // The swing, shared by both attacks. The pan's angle round her is a screen angle (0 is her right, 90 toward the
    // camera, -90 away): it rests over her shoulder at restAngle, is pulled back to windAngle in the windup, whips
    // across through midAngle to followAngle, holds, and goes back to rest. The whole swing is turned to face the
    // player when the windup starts (midAngle points at him).
    restAngle: -75,
    windAngle: 200,
    midAngle: 90,
    followAngle: -25,
    // Seconds: the windup (the first windupRaise of it pulls the pan back, then she holds), the swing itself, the
    // follow-through and the recovery to rest.
    windupTime: 0.4,
    windupRaise: 0.4,
    swingTime: 0.12,
    followTime: 0.15,
    recoverTime: 0.25,
    // The pan as the sim sees it: from her middle out to panReach (world units), hurting within panHitRadius of
    // that line from panHitFrom of the way out, only during the swing.
    panReach: 190,
    panHitRadius: 22,
    panHitFrom: 0.25,
    // Fire Slap: when he is within slapRange (and further than strikeRange). The butterfly flies to butterflyFront
    // in front of her (toward him) over gatherTime, which is also the windup of each slap. After each slap's
    // follow-through (slapFollowTime) she hops hopDistance sideways over hopTime and slaps again, slapShots in all.
    slapRange: 1200,
    gatherTime: 0.45,
    butterflyFront: 40,
    slapFollowTime: 0.15,
    slapShots: 4,
    hopDistance: 200,
    hopTime: 0.15,
    // How much each hop leans toward the middle of the room: 0 goes straight sideways (alternating sides), 1 goes
    // straight at the middle. In between she takes the side nearer the middle, bent toward it this much.
    hopToMiddle: 0.35,
    // Fire Slam: whenever it is ready (slamCooldown, first slamFirstDelay after she wakes) and he is within slamRange,
    // she crouches (slamWindup), leaps at where he is over everything (slamAirTime, slamHeight screen pixels high; no
    // arrow reaches her up there) and smashes down, hurting the circle she lands in (slamRadius, marked on the ground
    // while she falls). A ring of fire then spreads from there at waveSpeed until each part of it meets a wall; it is
    // waveWidth thick and hurts as it passes, so he has to dash, teleport or cast Doomsday through it.
    slamCooldown: 9,
    slamFirstDelay: 4,
    slamRange: 1200,
    slamWindup: 0.5,
    slamAirTime: 0.75,
    slamHeight: 160,
    slamRadius: 110,
    slamLandTime: 0.45,
    slamShake: 12,
    slamColor: 0xff7a1a,
    waveSpeed: 420,
    waveWidth: 24,
    // How many pieces the ring is cut into, each stopping at its own wall.
    waveSegments: 72,
    deathSmoke: 50,
    deathShake: 14,
  },
  {
    hp: { min: 1, max: 10000, step: 10 },
    ccResist: { min: 0, max: 1, step: 0.05 },
    knockbackTaken: { min: 0, max: 1, step: 0.05 },
    knockbackDecay: { min: 0.5, max: 30, step: 0.5 },
    speed: { min: 10, max: 800, step: 5 },
    uniformScreenSpeed: 'bool',
    turnRate: { min: 0.5, max: 40, step: 0.5 },
    radius: { min: 2, max: 100, step: 1 },
    scale: { min: 0.3, max: 4, step: 0.05 },
    contactScale: { min: 0, max: 2, step: 0.05 },
    spawnTell: { min: 0, max: 5, step: 0.05 },
    walkFps: { min: 1, max: 30, step: 1 },
    dashFps: { min: 1, max: 60, step: 1 },
    attackCooldown: { min: 0, max: 10, step: 0.1 },
    strikeRange: { min: 0, max: 1500, step: 10 },
    strikeGap: { min: 0, max: 300, step: 5 },
    strikeDashMax: { min: 0, max: 1500, step: 10 },
    dashSpeed: { min: 100, max: 6000, step: 50 },
    restAngle: { min: -360, max: 360, step: 5 },
    windAngle: { min: -360, max: 360, step: 5 },
    midAngle: { min: -360, max: 360, step: 5 },
    followAngle: { min: -360, max: 360, step: 5 },
    windupTime: { min: 0.05, max: 3, step: 0.05 },
    windupRaise: { min: 0.05, max: 1, step: 0.05 },
    swingTime: { min: 0.02, max: 1, step: 0.01 },
    followTime: { min: 0, max: 2, step: 0.02 },
    recoverTime: { min: 0, max: 2, step: 0.05 },
    panReach: { min: 10, max: 400, step: 5 },
    panHitRadius: { min: 2, max: 100, step: 1 },
    panHitFrom: { min: 0, max: 1, step: 0.05 },
    slapRange: { min: 0, max: 3000, step: 10 },
    gatherTime: { min: 0.05, max: 3, step: 0.05 },
    butterflyFront: { min: 0, max: 200, step: 2 },
    slapFollowTime: { min: 0, max: 2, step: 0.02 },
    slapShots: { min: 1, max: 12, step: 1 },
    hopDistance: { min: 0, max: 600, step: 10 },
    hopTime: { min: 0.02, max: 1, step: 0.01 },
    hopToMiddle: { min: 0, max: 1, step: 0.05 },
    slamCooldown: { min: 0, max: 30, step: 0.5 },
    slamFirstDelay: { min: 0, max: 30, step: 0.5 },
    slamRange: { min: 0, max: 3000, step: 10 },
    slamWindup: { min: 0.05, max: 3, step: 0.05 },
    slamAirTime: { min: 0.1, max: 3, step: 0.05 },
    slamHeight: { min: 0, max: 500, step: 10 },
    slamRadius: { min: 10, max: 400, step: 5 },
    slamLandTime: { min: 0, max: 2, step: 0.05 },
    slamShake: { min: 0, max: 40, step: 1 },
    slamColor: 'color',
    waveSpeed: { min: 50, max: 2000, step: 10 },
    waveWidth: { min: 4, max: 200, step: 2 },
    waveSegments: { min: 8, max: 256, step: 4 },
    deathSmoke: { min: 0, max: 150, step: 1 },
    deathShake: { min: 0, max: 40, step: 1 },
  },
);

// Fire Slap's fireballs: Flame Torrent's, from the butterfly in front of her. Their tip is where the player stood,
// at least minRange and at most range away. The same fields as Flame Torrent's (see flame_torrent), but no damage:
// one hit kills him.
export const kateFireballs = defineConfig(
  'kate_fireballs',
  'bosses',
  {
    range: 1200,
    minRange: 150,
    width: 120,
    side: 24,
    outTime: 1,
    returnSpeed: 900,
    catchRadius: 30,
    perSide: 1,
    gap: 0.06,
    hitRadius: 18,
    rehitTime: 0.4,
    height: 14,
    scale: 2.5,
    frameTime: 0.06,
    trail: 40,
  },
  {
    range: { min: 50, max: 2000, step: 10 },
    minRange: { min: 0, max: 1000, step: 10 },
    width: { min: 0, max: 300, step: 5 },
    side: { min: 0, max: 100, step: 2 },
    outTime: { min: 0.1, max: 3, step: 0.05 },
    returnSpeed: { min: 100, max: 3000, step: 25 },
    catchRadius: { min: 2, max: 80, step: 1 },
    perSide: { min: 1, max: 8, step: 1 },
    gap: { min: 0, max: 0.5, step: 0.01 },
    hitRadius: { min: 2, max: 60, step: 1 },
    rehitTime: { min: 0.05, max: 2, step: 0.05 },
    height: { min: 0, max: 60, step: 1 },
    scale: { min: 0.25, max: 4, step: 0.25 },
    frameTime: { min: 0.02, max: 0.3, step: 0.01 },
    trail: { min: 0, max: 200, step: 5 },
  },
);

// How Kate is drawn: her code-drawn arms and pan, the butterfly circling her, and where her hands and shoulders sit
// in each pose. Positions are art pixels from the bottom middle of her sprite (x to her right on screen, y up is
// negative). Both hands hold the pan's handle at the grip, the second handGap further along it.
export const kateLook = defineConfig(
  'kate_look',
  'bosses',
  {
    sleeveColor: 0xf2c230,
    sleeveEdgeColor: 0x2a1a14,
    handColor: 0xf6cfae,
    sleeveWidth: 2.25,
    sleeveEdge: 0.6,
    handSize: 1.3,
    // Each arm is two parts this long (art pixels), bent at the elbow; the hand stops short if the grip is further.
    armLength: 7.5,
    handGap: 8.5,
    // How thick the pan is drawn (1 keeps the sprite's own shape; its length is kate.panReach, which is also how far it
    // hits), and where its handle end sits in
    // the sprite (art pixels from its left edge, and down from its top).
    panThickness: 1.25,
    // How much the pan looks shorter when it points toward or away from the camera: 0 never, 1 fully.
    panForeshorten: 0,
    panHandleX: 0,
    panHandleY: 21,
    // The poses: the windup (key 1), the swing's middle (2), the follow-through (3) and the rest over her shoulder
    // (4, also her walk). The hands move between them as the pan does.
    grip1X: -12,
    grip1Y: -19,
    shoulders1X: -11,
    grip2X: 0,
    grip2Y: -20,
    shoulders2X: -5,
    grip3X: 11,
    grip3Y: -20,
    shoulders3X: 1,
    grip4X: 5,
    grip4Y: -27,
    shoulders4X: -5,
    // Shoulders: the left one at shouldersNX, the right one shoulderSpan to its right, both at shoulderY (the rest
    // pose's are restShoulderY, as she stands up straight).
    shoulderSpan: 9,
    shoulderY: -29.5,
    restShoulderY: -31.5,
    // Dashing she trails the pan in her back hand (drawn facing right; mirrored when she runs left).
    dashGripX: -9,
    dashGripY: -17,
    dashAngle: 165,
    dashShoulderX: 1.5,
    dashShoulderY: -27,
    dashShoulderSpan: 5,
    // A pale trail behind the pan during the swing.
    trailAlpha: 0.35,
    // The fire butterfly circling her: how far (world units), how high (art pixels), turns a second, its size,
    // seconds per frame, its glow (art pixels across, and how bright) and embers a second.
    butterflyDistance: 40,
    butterflyHeight: 46,
    butterflySpin: 0.15,
    butterflyScale: 1,
    butterflyFrameTime: 0.16,
    butterflyGlow: 18,
    butterflyGlowAlpha: 0.5,
    butterflyEmbers: 6,
    // How quickly it flies to its spot in front of her for a slap, and back (higher is snappier).
    butterflyRate: 10,
  },
  {
    sleeveColor: 'color',
    sleeveEdgeColor: 'color',
    handColor: 'color',
    sleeveWidth: { min: 0.25, max: 6, step: 0.25 },
    sleeveEdge: { min: 0, max: 3, step: 0.1 },
    handSize: { min: 0, max: 4, step: 0.1 },
    armLength: { min: 2, max: 20, step: 0.5 },
    handGap: { min: 0, max: 12, step: 0.5 },
    panThickness: { min: 0.2, max: 3, step: 0.05 },
    panForeshorten: { min: 0, max: 1, step: 0.05 },
    panHandleX: { min: 0, max: 78, step: 1 },
    panHandleY: { min: 0, max: 42, step: 1 },
    grip1X: { min: -30, max: 30, step: 0.5 },
    grip1Y: { min: -52, max: 0, step: 0.5 },
    shoulders1X: { min: -30, max: 30, step: 0.5 },
    grip2X: { min: -30, max: 30, step: 0.5 },
    grip2Y: { min: -52, max: 0, step: 0.5 },
    shoulders2X: { min: -30, max: 30, step: 0.5 },
    grip3X: { min: -30, max: 30, step: 0.5 },
    grip3Y: { min: -52, max: 0, step: 0.5 },
    shoulders3X: { min: -30, max: 30, step: 0.5 },
    grip4X: { min: -30, max: 30, step: 0.5 },
    grip4Y: { min: -52, max: 0, step: 0.5 },
    shoulders4X: { min: -30, max: 30, step: 0.5 },
    shoulderSpan: { min: 0, max: 20, step: 0.5 },
    shoulderY: { min: -52, max: 0, step: 0.5 },
    restShoulderY: { min: -52, max: 0, step: 0.5 },
    dashGripX: { min: -30, max: 30, step: 0.5 },
    dashGripY: { min: -52, max: 0, step: 0.5 },
    dashAngle: { min: -360, max: 360, step: 5 },
    dashShoulderX: { min: -30, max: 30, step: 0.5 },
    dashShoulderY: { min: -52, max: 0, step: 0.5 },
    dashShoulderSpan: { min: 0, max: 20, step: 0.5 },
    trailAlpha: { min: 0, max: 1, step: 0.05 },
    butterflyDistance: { min: 0, max: 150, step: 1 },
    butterflyHeight: { min: 0, max: 120, step: 1 },
    butterflySpin: { min: 0, max: 1, step: 0.01 },
    butterflyScale: { min: 0.25, max: 4, step: 0.25 },
    butterflyFrameTime: { min: 0.03, max: 0.5, step: 0.01 },
    butterflyGlow: { min: 0, max: 100, step: 1 },
    butterflyGlowAlpha: { min: 0, max: 1, step: 0.05 },
    butterflyEmbers: { min: 0, max: 40, step: 1 },
    butterflyRate: { min: 0.5, max: 40, step: 0.5 },
  },
);
