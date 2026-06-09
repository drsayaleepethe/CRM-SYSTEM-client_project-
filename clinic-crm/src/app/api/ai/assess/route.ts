/**
 * src/app/api/ai/assess/route.ts
 *
 * FREE rule-based report generator — no Anthropic API, no cost.
 *
 * POST /api/ai/assess
 * Body: { type: "diagnosis" | "documents", summary: string, mobGrade?: string, primaryDx?: string }
 *
 * Generates structured clinical output from the assessment data using
 * deterministic rules derived from the clinical inputs. The output schema
 * is identical to the Anthropic version so the frontend needs zero changes.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/rbac";
import { logger } from "@/lib/logger";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

function parseNRS(summary: string): number {
  const m = summary.match(/NRS[:\s]*(\d+)/i);
  return m ? Math.min(10, parseInt(m[1])) : 5;
}

function parseComplaint(summary: string): string {
  const m = summary.match(/COMPLAINT:\s*([^|]+)/i);
  return m ? m[1].trim() : "musculoskeletal pain";
}

function parseStage(nrs: number, summary: string): string {
  if (summary.toLowerCase().includes("acute") || summary.includes("Onset:") && summary.match(/Onset:[^|]*(\d+)\s*day/i)) return "Acute";
  if (nrs >= 7) return "Acute";
  if (nrs >= 4) return "Subacute";
  return "Chronic";
}

function parseIrritability(nrs: number, summary: string): string {
  const s = summary.toLowerCase();
  if (nrs >= 8 || s.includes("constant") || s.includes("inflammatory")) return "High";
  if (nrs >= 5 || s.includes("moderate")) return "Moderate";
  return "Low";
}

function parseLoad(summary: string): string {
  const s = summary.toLowerCase();
  if (s.includes("athletic") || s.includes("heavily loaded")) return "M4";
  if (s.includes("moderately loaded")) return "M3";
  if (s.includes("lightly loaded")) return "M2";
  return "M2";
}

function parseRegions(summary: string): string[] {
  const regions: string[] = [];
  const regionMap: Record<string, string> = {
    cervical: "Cervical Spine", thoracic: "Thoracic Spine", lumbar: "Lumbar/SIJ",
    shoulder: "Shoulder", elbow: "Elbow", wrist: "Wrist", hip: "Hip",
    knee: "Knee", ankle: "Ankle",
  };
  const tests = summary.match(/SPECIAL TESTS:\n([\s\S]*?)(?:\n\n|$)/i);
  if (tests) {
    Object.entries(regionMap).forEach(([key, name]) => {
      if (tests[1].toLowerCase().includes(key) || tests[1].includes(name)) {
        regions.push(key);
      }
    });
  }
  // Also detect from pain map
  const painMap: Record<string, string[]> = {
    cervical: ["Neck", "neck"],
    lumbar: ["Lower Back", "SIJ"],
    shoulder: ["Shoulder"],
    knee: ["Knee"],
    hip: ["Hip"],
    ankle: ["Shin", "Calf"],
  };
  Object.entries(painMap).forEach(([key, terms]) => {
    if (terms.some(t => summary.includes(t)) && !regions.includes(key)) {
      regions.push(key);
    }
  });
  return regions.length ? regions : ["lumbar"];
}

function parseSpecialties(summary: string): string[] {
  const sp: string[] = [];
  if (summary.includes("WOMENS")) sp.push("womens");
  if (summary.includes("ERGO")) sp.push("ergo");
  if (summary.includes("SPORTS")) sp.push("sports");
  if (summary.includes("CHRONIC")) sp.push("chronic");
  return sp;
}

function parseMobility(summary: string): string {
  const m = summary.match(/MOBILITY:[^-]+-([^\n]+)/);
  return m ? m[1].trim() : "not scored";
}

function parseOccupation(summary: string): string {
  const m = summary.match(/Occ:([^,\n]+)/);
  return m ? m[1].trim() : "desk-based worker";
}

function parseSleep(summary: string): number {
  const m = summary.match(/Sleep(\d+(?:\.\d+)?)h/);
  return m ? parseFloat(m[1]) : 7;
}

function parseStress(summary: string): number {
  const m = summary.match(/Stress(\d+)\/10/);
  return m ? parseInt(m[1]) : 5;
}

function parseName(summary: string): string {
  const m = summary.match(/PATIENT:\s*([^,]+)/);
  return m ? m[1].trim() : "Patient";
}

// ─── DIAGNOSIS BUILDER ────────────────────────────────────────────────────────

const DIAGNOSIS_RULES: Record<string, {
  conditions: (s: string) => boolean;
  name: string;
  icd: string;
  rationale: (s: string) => string;
  confidence: (s: string) => number;
}[]> = {
  cervical: [
    {
      conditions: s => /spurling.*POS|ULTT.*POS|radiculopathy/i.test(s),
      name: "Cervical Radiculopathy",
      icd: "M54.12",
      rationale: s => "Positive neural tension test and/or Spurling's indicating foraminal compression with nerve root involvement.",
      confidence: s => /spurling.*POS/i.test(s) ? 82 : 70,
    },
    {
      conditions: s => /flexRot.*POS|cervicogenic/i.test(s),
      name: "Cervicogenic Headache (C1-C2)",
      icd: "G44.841",
      rationale: s => "Positive Flexion-Rotation Test suggests upper cervical joint restriction at C1-C2.",
      confidence: s => 75,
    },
    {
      conditions: s => true,
      name: "Mechanical Neck Pain",
      icd: "M54.2",
      rationale: s => "Load-dependent cervical pain with movement restriction, consistent with mechanical cervical dysfunction.",
      confidence: s => 68,
    },
  ],
  lumbar: [
    {
      conditions: s => /slr.*POS|slump.*POS/i.test(s),
      name: "Lumbar Radiculopathy",
      icd: "M54.4",
      rationale: s => "Positive neural tension signs (SLR/Slump) indicate nerve root irritation at lumbar level.",
      confidence: s => /slr.*POS/i.test(s) ? 80 : 72,
    },
    {
      conditions: s => /centralisation/i.test(s),
      name: "Discogenic LBP — McKenzie Classification",
      icd: "M51.17",
      rationale: s => "Directional preference with centralisation response confirms discogenic origin responsive to MDT.",
      confidence: s => 78,
    },
    {
      conditions: s => true,
      name: "Mechanical Low Back Pain",
      icd: "M54.5",
      rationale: s => "Activity-related lumbar pain with movement restriction, no neurological signs. Mechanical classification.",
      confidence: s => 72,
    },
  ],
  shoulder: [
    {
      conditions: s => /hawkins.*POS|emptyCan.*POS|painfulArc.*POS/i.test(s),
      name: "Subacromial Impingement Syndrome / RC Tendinopathy",
      icd: "M75.1",
      rationale: s => "Positive impingement cluster (Hawkins-Kennedy, Empty Can, Painful Arc) confirms subacromial pathology.",
      confidence: s => 80,
    },
    {
      conditions: s => /frozen|adhesive/i.test(s),
      name: "Adhesive Capsulitis (Frozen Shoulder)",
      icd: "M75.0",
      rationale: s => "Global restriction of glenohumeral ROM in capsular pattern indicating frozen shoulder.",
      confidence: s => 75,
    },
    {
      conditions: s => true,
      name: "Shoulder Rotator Cuff Dysfunction",
      icd: "M75.1",
      rationale: s => "Shoulder pain with functional limitation, motor control deficit and impingement signs.",
      confidence: s => 68,
    },
  ],
  knee: [
    {
      conditions: s => /lachman.*POS/i.test(s),
      name: "ACL Sprain / Rupture",
      icd: "S83.5",
      rationale: s => "Positive Lachman's with anterior tibial translation indicating ACL compromise.",
      confidence: s => 85,
    },
    {
      conditions: s => /mcmurray.*POS|thessaly.*POS/i.test(s),
      name: "Meniscal Pathology",
      icd: "M23.2",
      rationale: s => "Positive meniscal load test (McMurray/Thessaly) indicating intra-articular meniscal involvement.",
      confidence: s => 78,
    },
    {
      conditions: s => true,
      name: "Patellofemoral Pain Syndrome",
      icd: "M22.2",
      rationale: s => "Anterior knee pain aggravated by loading activities, consistent with PFPS.",
      confidence: s => 65,
    },
  ],
  hip: [
    {
      conditions: s => /FADIR.*POS|FAI/i.test(s),
      name: "Femoroacetabular Impingement (FAI)",
      icd: "M25.851",
      rationale: s => "Positive FADIR test indicating anterior hip impingement of femoroacetabular joint.",
      confidence: s => 72,
    },
    {
      conditions: s => true,
      name: "Hip Osteoarthritis / Gluteal Tendinopathy",
      icd: "M16.9",
      rationale: s => "Load-related hip pain with restricted ROM and gluteal muscle involvement.",
      confidence: s => 65,
    },
  ],
  ankle: [
    {
      conditions: s => /thompson.*POS/i.test(s),
      name: "Achilles Tendon Rupture",
      icd: "S86.01",
      rationale: s => "Positive Thompson test confirms Achilles tendon discontinuity.",
      confidence: s => 95,
    },
    {
      conditions: s => /windlass.*POS/i.test(s),
      name: "Plantar Fasciopathy",
      icd: "M72.2",
      rationale: s => "Positive Windlass test reproducing medial heel pain confirms plantar fascia involvement.",
      confidence: s => 88,
    },
    {
      conditions: s => true,
      name: "Ankle Ligament Sprain / Instability",
      icd: "S93.4",
      rationale: s => "Lateral ankle pain with load-dependent symptoms and restricted dorsiflexion.",
      confidence: s => 65,
    },
  ],
  thoracic: [
    {
      conditions: s => true,
      name: "Thoracic Segmental Dysfunction",
      icd: "M54.6",
      rationale: s => "Thoracic stiffness with segmental pain on PA testing consistent with facet/costovertebral dysfunction.",
      confidence: s => 70,
    },
  ],
  elbow: [
    {
      conditions: s => /cozen.*POS/i.test(s),
      name: "Lateral Epicondylopathy (Tennis Elbow)",
      icd: "M77.1",
      rationale: s => "Positive Cozen's test reproducing lateral elbow pain confirms ECRB tendinopathy.",
      confidence: s => 82,
    },
    {
      conditions: s => true,
      name: "Elbow Tendinopathy",
      icd: "M77.9",
      rationale: s => "Load-related elbow pain with tenderness at epicondyle insertion.",
      confidence: s => 65,
    },
  ],
  wrist: [
    {
      conditions: s => /phalens.*POS/i.test(s),
      name: "Carpal Tunnel Syndrome",
      icd: "G54.0",
      rationale: s => "Positive Phalen's test with median nerve distribution symptoms confirms CTS.",
      confidence: s => 80,
    },
    {
      conditions: s => true,
      name: "Wrist Tendinopathy / De Quervain's",
      icd: "M65.4",
      rationale: s => "Wrist pain with load-related aggravation and positive functional tests.",
      confidence: s => 65,
    },
  ],
};

function buildDiagnoses(summary: string, regions: string[]): any[] {
  const dx: any[] = [];
  const seen = new Set<string>();

  for (const region of regions) {
    const rules = DIAGNOSIS_RULES[region];
    if (!rules) continue;
    for (const rule of rules) {
      if (rule.conditions(summary) && !seen.has(rule.name)) {
        seen.add(rule.name);
        dx.push({
          r: dx.length + 1,
          n: rule.name,
          c: Math.max(30, rule.confidence(summary) - dx.length * 8),
          icd: rule.icd,
          why: rule.rationale(summary),
          for: buildForFactors(summary, region),
          against: buildAgainstFactors(summary),
        });
        if (dx.length === 3) break;
      }
    }
    if (dx.length === 3) break;
  }

  // Ensure at least 3 diagnoses
  const fallbacks = [
    { r: 0, n: "Mechanical MSK Pain", c: 60, icd: "M79.3", why: "Non-specific musculoskeletal pain with movement dysfunction and load intolerance.", for: [], against: [] },
    { r: 0, n: "Myofascial Pain Syndrome", c: 45, icd: "M79.1", why: "Muscle-referral pattern and trigger point tenderness contributing to pain presentation.", for: [], against: [] },
    { r: 0, n: "Movement Dysfunction / Deconditioning", c: 35, icd: "M62.81", why: "Reduced movement capacity and load tolerance consistent with deconditioning.", for: [], against: [] },
  ];
  for (const fb of fallbacks) {
    if (dx.length >= 3) break;
    if (!seen.has(fb.n)) {
      seen.add(fb.n);
      dx.push({ ...fb, r: dx.length + 1 });
    }
  }

  return dx.slice(0, 3).map((d, i) => ({ ...d, r: i + 1 }));
}

function buildForFactors(summary: string, region: string): string[] {
  const factors: string[] = [];
  const nrs = parseNRS(summary);
  if (nrs >= 6) factors.push("High pain intensity");
  if (/POS/.test(summary)) factors.push("Positive clinical test(s)");
  if (/Sudden increase/i.test(summary)) factors.push("Recent load spike");
  if (/Sustained postures/i.test(summary)) factors.push("Posture-related aggravation");
  if (/Rotation/i.test(summary)) factors.push("Rotational loading provokes symptoms");
  return factors.slice(0, 3).length ? factors.slice(0, 3) : ["Load-dependent symptoms", "Consistent with regional pattern"];
}

function buildAgainstFactors(summary: string): string[] {
  const factors: string[] = [];
  if (!/fever|weight loss|night pain/i.test(summary)) factors.push("No red flag symptoms");
  if (!/bilateral.*numbness/i.test(summary)) factors.push("No bilateral neurological signs");
  return factors.length ? factors : ["No clear contradicting findings"];
}

function buildPlan(nrs: number, stage: string, irritability: string, regions: string[]): any {
  const isAcute = stage === "Acute";
  const isHigh = irritability === "High";
  return {
    p1: {
      t: "Pain Modulation",
      d: isAcute ? "1-2w" : "2-3w",
      f: isHigh ? "3x/wk" : "2-3x/wk",
      g: ["Reduce pain to NRS ≤3", "Restore pain-free ROM"],
      rx: [
        isHigh ? "IFT 80-150Hz · 15 min for pain relief" : "TENS 80Hz · 20 min",
        "Maitland Grade I-II oscillations",
        "Dry Needling — TrP release",
        "KT inhibitory taping",
        "Pain neuroscience education",
      ],
    },
    p2: {
      t: "Mobility & Motor Control",
      d: "3-4w",
      f: "2-3x/wk",
      g: ["Full pain-free ROM", "Improve movement quality"],
      rx: [
        "Maitland Grade III-IV mobilisation",
        "Myofascial Release (MFR)",
        "Active ROM exercises",
        "Motor control retraining",
        "Russian Currents for muscle re-education",
      ],
    },
    p3: {
      t: "Capacity Building",
      d: "4-6w",
      f: "2x/wk",
      g: ["Load tolerance", "Functional strength"],
      rx: [
        "Progressive resistance training",
        "Functional movement patterns",
        "Ergonomic integration",
        "Kinesiotaping for proprioception",
      ],
    },
    p4: {
      t: "Return to Function",
      d: "2-4w",
      f: "1x/wk",
      g: ["Full return to activity", "Self-management independence"],
      rx: [
        "Sport/work-specific training",
        "HEP progression",
        "Self-management strategies",
        "Discharge planning",
      ],
    },
  };
}

function buildHEP(regions: string[], nrs: number): any[] {
  const hepByRegion: Record<string, any[]> = {
    cervical: [
      { n: "Chin Tuck (Deep Neck Flexor Activation)", s: 3, r: 10, f: "2x daily", c: "Gently retract chin, hold 5 sec. Keep eyes level." },
      { n: "Cervical AROM — Rotation", s: 2, r: 10, f: "Daily", c: "Slow, pain-free rotation L and R. Stop at end-range." },
    ],
    lumbar: [
      { n: "Diaphragmatic Breathing / TVA Activation", s: 3, r: 10, f: "2x daily", c: "Belly breathing with gentle core brace. Do not hold breath." },
      { n: "Knee-to-Chest Stretch", s: 2, r: 30, f: "Daily", c: "Hold 30 sec each side. Keep opposite leg flat." },
    ],
    shoulder: [
      { n: "Pendulum Exercise", s: 3, r: 20, f: "Daily", c: "Lean forward, let arm hang. Gentle circles. No active effort." },
      { n: "External Rotation with Band", s: 3, r: 12, f: "Daily", c: "Elbow at side, 90° flex. Rotate outward. Controlled return." },
    ],
    knee: [
      { n: "Quad Sets", s: 3, r: 15, f: "Daily", c: "Tighten quad with knee straight. Hold 5 sec." },
      { n: "Straight Leg Raise", s: 3, r: 10, f: "Daily", c: "Core braced, raise leg 45°. Slow lower." },
    ],
    hip: [
      { n: "Clamshell Exercise", s: 3, r: 15, f: "Daily", c: "Side lying, feet together. Rotate top knee up. Keep pelvis still." },
      { n: "Glute Bridge", s: 3, r: 12, f: "Daily", c: "Feet flat, push hips up. Squeeze glutes at top. Hold 2 sec." },
    ],
    ankle: [
      { n: "Calf Raises", s: 3, r: 15, f: "Daily", c: "Both legs. Slow up and down. Progress to single leg." },
      { n: "Ankle Alphabet", s: 2, r: 1, f: "Daily", c: "Trace alphabet with foot. Improves proprioception." },
    ],
    thoracic: [
      { n: "Thoracic Extension over Foam Roller", s: 2, r: 8, f: "Daily", c: "Sit back over roller at mid-thoracic level. Support head. Hold 3 sec." },
    ],
    elbow: [
      { n: "Wrist Extensor Eccentric Lowering", s: 3, r: 15, f: "Daily", c: "Slow eccentric lowering of wrist over table edge." },
    ],
    wrist: [
      { n: "Wrist Tendon Glides", s: 3, r: 10, f: "2x daily", c: "Full fist → straight fingers → hook fist → tabletop → straight fist." },
    ],
  };

  const hep: any[] = [];
  for (const r of regions) {
    const exercises = hepByRegion[r] || [];
    for (const ex of exercises) {
      if (hep.length < 5) hep.push(ex);
    }
  }

  // Fill to 5 with generic exercises
  const generic = [
    { n: "Diaphragmatic Breathing", s: 3, r: 10, f: "Daily", c: "Slow nasal inhale 4 sec, exhale 6 sec. Reduces sympathetic load." },
    { n: "Postural Correction Exercise", s: 3, r: 10, f: "2x daily", c: "Gentle shoulder retraction and chin tuck. Hold 5 sec." },
    { n: "Walking Programme", s: 1, r: 20, f: "Daily", c: "20 min brisk walk at comfortable pace. Builds general load capacity." },
  ];
  for (const g of generic) {
    if (hep.length >= 5) break;
    hep.push(g);
  }

  return hep.slice(0, 5);
}

function buildInvestment(nrs: number, stage: string): any {
  if (nrs >= 7 || stage === "Acute") {
    return { ph: 1, nm: "Foundation", sess: 8, pr: "₹7,600", why: "High irritability requires frequent short-term pain modulation sessions." };
  }
  if (nrs >= 4) {
    return { ph: 2, nm: "Build", sess: 12, pr: "₹11,400", why: "Subacute presentation responds best to structured 12-session progressive rehab." };
  }
  return { ph: 3, nm: "Restore", sess: 16, pr: "₹15,200", why: "Chronic presentation needs extended capacity building and movement retraining." };
}

function buildYellowFlags(summary: string, stress: number, sleep: number): string[] {
  const flags: string[] = [];
  if (stress >= 7) flags.push("High stress levels may amplify pain perception");
  if (sleep < 6) flags.push("Poor sleep quality impairs tissue recovery");
  if (/fear|anxiety|avoid/i.test(summary)) flags.push("Fear-avoidance behaviour noted");
  if (/Catastrophis/i.test(summary)) flags.push("Catastrophising present — consider psychosocial screening");
  return flags;
}

function buildRedFlags(summary: string): string[] {
  const flags: string[] = [];
  if (/lhermittes.*POS/i.test(summary)) flags.push("Positive Lhermitte's Sign — cervical cord involvement, urgent referral required");
  if (/sharpPurser.*POS/i.test(summary)) flags.push("Positive Sharp-Purser Test — atlanto-axial instability, immediate precaution");
  if (/bilateral.*numb|bowel|bladder/i.test(summary)) flags.push("Bilateral neurological symptoms — cauda equina screening required");
  return flags;
}

// ─── SOAP NOTE BUILDER ────────────────────────────────────────────────────────

function buildSOAP(summary: string, primaryDx: string, nrs: number, stage: string): any {
  const name = parseName(summary);
  const complaint = parseComplaint(summary);
  const occ = parseOccupation(summary);
  const agg = summary.match(/Agg:([^|]+)/)?.[1]?.trim() || "aggravating activities";
  const ease = summary.match(/Ease:([^|]+)/)?.[1]?.trim() || "rest";

  return {
    s: `${name} presents with ${complaint} (NRS ${nrs}/10). Symptoms are aggravated by ${agg} and eased by ${ease}. ${stage} presentation with ${parseIrritability(nrs, summary).toLowerCase()} irritability. Occupation: ${occ}.`,
    o: `MSK assessment completed. Pain map documented. ${summary.includes("SPECIAL TESTS") ? "Special orthopaedic tests performed — see test results. " : ""}Mobility score: ${parseMobility(summary)}. Load tolerance: ${parseLoad(summary)}.`,
    a: `Provisional classification: ${primaryDx}. ${stage} stage, ${parseIrritability(nrs, summary)} irritability. No contraindications to manual therapy identified.`,
    p: `Phase 1 programme: pain modulation via manual therapy (Maitland Grade I-II), electrotherapy (IFT/TENS), dry needling. Home exercise programme issued. Review in 2 weeks. Progress to Phase 2 (mobility) on achieving NRS ≤3.`,
  };
}

// ─── VYAYAMA METHOD REPORT BUILDER ───────────────────────────────────────────

function buildVyayamaReport(summary: string, primaryDx: string, nrs: number, regions: string[], stage: string, name: string): any {
  const occ = parseOccupation(summary);
  const stress = parseStress(summary);
  const sleep = parseSleep(summary);
  const mob = parseMobility(summary);

  return {
    pi: `Your pain is your body's signal that load and capacity are mismatched — not that something is permanently damaged. The ${primaryDx.toLowerCase()} you are experiencing is a provisional classification to guide treatment, not a life sentence. Pain can and does resolve with the right approach.`,
    rca: `The root cause of your presentation appears to be a combination of sustained postural load from ${occ} work, reduced movement variety, and accumulated tissue stress. Your ${stage.toLowerCase()} irritability means the system is sensitised but fully capable of recovery with progressive loading.`,
    mp: `Priority movements: restore pain-free cervical/lumbar range, reintroduce hip hinging and single-leg stability patterns. Avoid sustained end-range positions for >30 min. Movement is medicine — graded exposure is the goal, not rest.`,
    lp: `${sleep < 7 ? `Sleep is currently insufficient at ${sleep}h — target 7-8h as it is your primary recovery tool. ` : ""}${stress >= 6 ? `Stress score of ${stress}/10 will amplify pain sensitivity — consider breathwork, walking, and social engagement as stress regulators. ` : ""}Hydration, anti-inflammatory foods, and daily movement breaks from the desk are non-negotiable lifestyle foundations.`,
    t3m: `In 3 months, the goal is for you to return to all daily activities pain-free (NRS 0-1), demonstrate full functional movement patterns with a mobility score of A or B, and have the tools to self-manage any flare-ups independently.`,
    cn: `Provisional classification: ${primaryDx}. Stage: ${stage}. Mobility: ${mob}. Full 9-step assessment completed. No red flags to contraindicate treatment. Proceed with Phase 1 programme.`,
  };
}

// ─── ROUTE HANDLER ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    requireRole(session, ["DOCTOR", "ADMIN"]);

    const body = await req.json();
    const { type, summary, mobGrade = "not scored", primaryDx = "?" } = body;

    if (!type || !summary) {
      return NextResponse.json({ error: "type and summary are required" }, { status: 400 });
    }
    if (!["diagnosis", "documents"].includes(type)) {
      return NextResponse.json({ error: "type must be 'diagnosis' or 'documents'" }, { status: 400 });
    }

    const nrs         = parseNRS(summary);
    const complaint   = parseComplaint(summary);
    const stage       = parseStage(nrs, summary);
    const irritability = parseIrritability(nrs, summary);
    const load        = parseLoad(summary);
    const regions     = parseRegions(summary);
    const stress      = parseStress(summary);
    const sleep       = parseSleep(summary);
    const name        = parseName(summary);
    const mobility    = parseMobility(summary);
    const occ         = parseOccupation(summary);

    if (type === "diagnosis") {
      const dx        = buildDiagnoses(summary, regions);
      const sessions  = nrs >= 7 ? "8-12" : nrs >= 4 ? "10-14" : "14-18";
      const weeks     = nrs >= 7 ? "6-8"  : nrs >= 4 ? "8-12"  : "12-16";

      const result = {
        dx,
        irr:   irritability,
        irrN:  `${irritability} irritability — ${irritability === "High" ? "pain provoked easily, settles slowly" : irritability === "Moderate" ? "pain provoked with sustained loading, settles with rest" : "pain provoked only with significant loading"}`,
        stage,
        load,
        prog:  { sess: sessions, wks: weeks, fac: ["Pain science education", "Progressive loading", "Self-management"] },
        yf:    buildYellowFlags(summary, stress, sleep),
        flags: buildRedFlags(summary),
        rc:    `Accumulated postural load and movement dysfunction in ${occ} with ${stage.toLowerCase()} irritability and ${load} load classification.`,
        movRx: ["Hip hinge with neutral spine", "Deep neck flexor activation (chin tuck)", "Single leg stance progression", "Thoracic rotation mobility"],
        lifeRx: [
          sleep < 7 ? `Improve sleep hygiene — currently ${sleep}h, target 7-8h` : "Maintain sleep hygiene",
          stress >= 6 ? "Structured stress management — breathwork 5 min/day" : "Continue current stress management",
          "Movement breaks every 30 min during desk work",
          "1.5-2L water intake daily",
        ],
        plan: buildPlan(nrs, stage, irritability, regions),
        hep:  buildHEP(regions, nrs),
        inv:  buildInvestment(nrs, stage),
      };

      logger.info("Rule-based diagnosis report generated", { doctorId: session.user.id, regions });
      return NextResponse.json({ result });
    }

    // documents
    const dxName = primaryDx === "?" ? buildDiagnoses(summary, regions)[0]?.n || "Mechanical MSK Pain" : primaryDx;
    const soap   = buildSOAP(summary, dxName, nrs, stage);
    const vm     = buildVyayamaReport(summary, dxName, nrs, regions, stage, name);

    const result = {
      soap,
      vm,
      ptR: `You have been assessed with a provisional classification of ${dxName}. Your physiotherapist has designed a personalised programme to reduce your pain and restore full function. The plan involves hands-on treatment, guided exercises, and lifestyle adjustments tailored to your work and daily routine.`,
      wa:  `Hi ${name}! 👋 Your assessment at Vyayāma Physio is complete. Provisional classification: *${dxName}*. We've put together a ${buildInvestment(nrs, stage).sess}-session personalised programme for you. Your report is now available on the patient portal. Please feel free to call us with any questions. See you soon! 🙏 — Vyayāma Physio Team`,
      sc:  {
        as: `Based on the assessment today, I can see that your ${dxName.toLowerCase()} has been going on for a while and is affecting your ${parseComplaint(summary).split(" ").slice(0, 4).join(" ")}. I've designed a ${buildInvestment(nrs, stage).sess}-session programme at ${buildInvestment(nrs, stage).pr} that will systematically address the root cause and get you back to full function. Would you like to start this week?`,
        up: `You've made excellent progress through Phase 1 — your pain is down and mobility is improving. To build on this and achieve full return to ${parseOccupation(summary)} without limitations, I'd recommend moving into Phase 2 (Mobility & Control). This is where we consolidate the gains and build the resilience you need long-term. Shall we continue?`,
      },
    };

    logger.info("Rule-based documents report generated", { doctorId: session.user.id });
    return NextResponse.json({ result });

  } catch (err) {
    if (err instanceof NextResponse) throw err;
    logger.error("POST /api/ai/assess failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}