"use client";

/**
 * src/app/dashboard/assessment/page.tsx
 *
 * Doctor-facing patient assessment page — fully integrated CRM version.
 * All clinical logic from vyayama_v5.jsx preserved verbatim.
 *
 * CHANGES from original:
 * - prefilledPatientId replaced with linkedPatientId (useState)
 * - P state no longer carries patientId field
 * - Step 0 has a debounced CRM patient search field with dropdown
 * - On patient select: name/phone/age auto-filled, linkedPatientId set
 * - saveAssessment sends linkedPatientId (not P.patientId)
 * - resetAll clears linkedPatientId + search state
 * - Step 8 summary shows CRM link status
 */

import React, { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

// ─── ZONES ────────────────────────────────────────────────────────────────────
const FZ = [
  {id:"head",lb:"Head",s:"e",cx:100,cy:36,rx:26,ry:29},
  {id:"neck",lb:"Neck",s:"r",x:88,y:66,w:24,h:17,r:5},
  {id:"l_sh",lb:"L Shoulder",s:"e",cx:64,cy:93,rx:21,ry:17},
  {id:"r_sh",lb:"R Shoulder",s:"e",cx:136,cy:93,rx:21,ry:17},
  {id:"chest",lb:"Chest",s:"r",x:77,y:82,w:46,h:46,r:7},
  {id:"l_ua",lb:"L Upper Arm",s:"r",x:44,y:92,w:20,h:44,r:8},
  {id:"r_ua",lb:"R Upper Arm",s:"r",x:136,y:92,w:20,h:44,r:8},
  {id:"l_fa",lb:"L Forearm",s:"r",x:43,y:139,w:18,h:42,r:7},
  {id:"r_fa",lb:"R Forearm",s:"r",x:139,y:139,w:18,h:42,r:7},
  {id:"l_wr",lb:"L Wrist/Hand",s:"r",x:43,y:184,w:18,h:22,r:6},
  {id:"r_wr",lb:"R Wrist/Hand",s:"r",x:139,y:184,w:18,h:22,r:6},
  {id:"abd",lb:"Abdomen",s:"r",x:77,y:128,w:46,h:44,r:6},
  {id:"l_hip",lb:"L Hip/Groin",s:"r",x:72,y:172,w:24,h:30,r:7},
  {id:"r_hip",lb:"R Hip/Groin",s:"r",x:104,y:172,w:24,h:30,r:7},
  {id:"l_th",lb:"L Thigh",s:"r",x:72,y:204,w:24,h:52,r:8},
  {id:"r_th",lb:"R Thigh",s:"r",x:104,y:204,w:24,h:52,r:8},
  {id:"l_kn",lb:"L Knee",s:"r",x:72,y:258,w:24,h:22,r:7},
  {id:"r_kn",lb:"R Knee",s:"r",x:104,y:258,w:24,h:22,r:7},
  {id:"l_sh2",lb:"L Shin",s:"r",x:74,y:283,w:20,h:42,r:6},
  {id:"r_sh2",lb:"R Shin",s:"r",x:106,y:283,w:20,h:42,r:6},
] as const;

const BZ = [
  {id:"u_bk",lb:"Upper Back",s:"r",x:77,y:82,w:46,h:24,r:6},
  {id:"m_bk",lb:"Mid Back",s:"r",x:77,y:107,w:46,h:22,r:6},
  {id:"l_bk",lb:"Lower Back",s:"r",x:77,y:130,w:46,h:22,r:6},
  {id:"sij",lb:"SIJ/Buttock",s:"r",x:77,y:153,w:46,h:22,r:6},
  {id:"l_gl",lb:"L Gluteal",s:"r",x:72,y:172,w:24,h:30,r:7},
  {id:"r_gl",lb:"R Gluteal",s:"r",x:104,y:172,w:24,h:30,r:7},
  {id:"l_hm",lb:"L Hamstring",s:"r",x:72,y:204,w:24,h:52,r:8},
  {id:"r_hm",lb:"R Hamstring",s:"r",x:104,y:204,w:24,h:52,r:8},
  {id:"l_cf",lb:"L Calf",s:"r",x:74,y:283,w:20,h:42,r:6},
  {id:"r_cf",lb:"R Calf",s:"r",x:106,y:283,w:20,h:42,r:6},
] as const;

const AZ = [...FZ, ...BZ];
const pCol = (n: number) => !n || n === 0 ? "transparent" : n <= 3 ? "#F5D080" : n <= 6 ? "#E8884A" : "#C4622D";

// ─── TESTS ────────────────────────────────────────────────────────────────────
const TESTS: Record<string, any> = {
  cervical:{lb:"Cervical Spine",ic:"◈",bi:true,cx:["Mech neck pain","Cervical radiculopathy","Cervicogenic HA","TOS","Myelopathy"],ts:[
    {id:"spurling",n:"Spurling's Test",p:"Cervical radiculopathy",bi:true,desc:"Laterally flex+rotate to symptomatic side. Apply gentle downward compression through crown.",interp:"POSITIVE: Radiating arm pain (not just neck pain). Foraminal narrowing compressing nerve root.",se:30,sp:93},
    {id:"distraction",n:"Cervical Distraction",p:"Nerve root compression",bi:true,desc:"Supine. Gradual axial traction ~14kg for 30 sec.",interp:"POSITIVE: Arm symptoms relieved. Foraminal opening decompresses nerve root.",se:40,sp:90},
    {id:"ultt1",n:"ULTT 1 – Median",p:"Median nerve neurodynamics",bi:true,desc:"Shoulder depression → 90° ABD → ER → elbow extension → wrist extension → contralateral lateral flex.",interp:"POSITIVE: Thumb/index/middle symptoms or >10° elbow extension deficit vs opposite.",se:72,sp:33},
    {id:"flexRot",n:"Flexion-Rotation Test",p:"C1-C2 / cervicogenic HA",bi:true,desc:"Supine. Fully flex cervical spine then rotate L and R. Normal ≥44° each side.",interp:"POSITIVE: <32° or headache reproduced. Gold standard for cervicogenic headache.",se:91,sp:90},
    {id:"sharpPurser",n:"Sharp-Purser Test",p:"Atlanto-axial instability",bi:false,desc:"Hand on forehead, other on C2. Gentle posterior translation. Listen/feel for clunk.",interp:"POSITIVE: Clunk or symptom relief. Atlanto-axial instability. SAFETY TEST.",se:69,sp:96},
    {id:"lhermittes",n:"Lhermitte's Sign",p:"Cervical myelopathy",bi:false,desc:"Passively fully flex cervical spine. Hold 30 sec.",interp:"POSITIVE: Electric shock into limbs. Cervical cord involvement. Immediate referral.",se:27,sp:97},
  ]},
  thoracic:{lb:"Thoracic Spine",ic:"◉",bi:true,cx:["Thoracic dysfunction","Costovertebral pain","Rib dysfunction"],ts:[
    {id:"tPA",n:"Thoracic PA Glide",p:"Segmental stiffness",bi:false,desc:"Prone. PA pressure to each thoracic spinous process.",interp:"POSITIVE: Pain, stiffness, or asymmetry at specific levels."},
    {id:"ribSpring",n:"Rib Spring Test",p:"Costovertebral dysfunction",bi:false,desc:"Prone. Firm pressure over rib angle.",interp:"POSITIVE: Rib angle or chest wall pain. Costovertebral dysfunction."},
    {id:"thorRot",n:"Thoracic Rotation ROM",p:"Mobility screen",bi:true,desc:"Seated, arms crossed. Active rotation, pelvis stabilised. Normal = 50° each side.",interp:"POSITIVE: <35° or >10° asymmetry. Contributes to cervical/shoulder/lumbar syndromes."},
  ]},
  lumbar:{lb:"Lumbar/SIJ",ic:"◎",bi:true,cx:["Mech LBP","Lumbar radiculopathy","Discogenic pain","SIJ dysfunction"],ts:[
    {id:"slr",n:"SLR",p:"Lumbar radiculopathy L4-S1",bi:true,desc:"Passive SLR + ankle DF sensitisation. Record degree of onset.",interp:"POSITIVE: Leg pain (NOT back) at 30-70° with DF sensitisation. Crossed SLR = disc herniation.",se:92,sp:28},
    {id:"slump",n:"Slump Test",p:"Neural tension",bi:true,desc:"Seated: thoracic+lumbar slump → neck flex → knee extension → ankle DF.",interp:"POSITIVE: Symptoms relieved with neck extension. More sensitive than SLR.",se:84,sp:83},
    {id:"kemp",n:"Kemp's Test",p:"Facet joint irritation",bi:true,desc:"Standing: ipsilateral LF + rotation + extension with overpressure.",interp:"POSITIVE: Local back pain (not leg). Facetogenic pattern.",se:55,sp:80},
    {id:"lumFABER",n:"FABER Test",p:"Hip/SIJ dysfunction",bi:true,desc:"Figure-4 position. Gravity + overpressure to knee and contralateral ASIS.",interp:"POSITIVE: Groin=hip. Posterior=SIJ. Compare height bilaterally.",se:57,sp:71},
    {id:"centralisation",n:"Centralisation/Peripheralisation",p:"McKenzie directional preference",bi:false,desc:"10 repeated end-range movements. Monitor symptom response.",interp:"POSITIVE (centralisation): Symptoms migrate proximally. Discogenic LBP responsive to MDT.",se:74,sp:81},
  ]},
  shoulder:{lb:"Shoulder",ic:"◷",bi:true,cx:["RC tendinopathy","Impingement","Frozen shoulder","SLAP","Instability"],ts:[
    {id:"hawkins",n:"Hawkins-Kennedy",p:"Subacromial impingement",bi:true,desc:"Shoulder+elbow 90°. Passively IR shoulder.",interp:"POSITIVE: Anterior/superior shoulder pain with IR. Supraspinatus impingement.",se:79,sp:59},
    {id:"emptyCan",n:"Empty Can/Jobe's",p:"Supraspinatus integrity",bi:true,desc:"Arm 90° scapular plane, thumb down. Downward resistance.",interp:"POSITIVE: Pain and/or weakness. Weakness = full-thickness tear.",se:69,sp:66},
    {id:"dropArm",n:"Drop Arm Test",p:"Large RC tear",bi:true,desc:"Passively abduct to 90°. Patient slowly lowers arm.",interp:"POSITIVE: Cannot control lowering. Highly specific for large RC tear.",se:35,sp:88},
    {id:"extLag",n:"ER Lag Sign",p:"Infraspinatus tear",bi:true,desc:"Elbow 20° flex, shoulder 20° passive ER. Release — patient maintains.",interp:"POSITIVE: Arm drifts to IR. Highly specific for infraspinatus full-thickness tear.",se:56,sp:98},
    {id:"obrien",n:"O'Brien's Test",p:"SLAP/AC joint",bi:true,desc:"Arm 90° flex, 15° medial adduction, maximal IR. Downward force. Repeat ER.",interp:"POSITIVE for SLAP: Deep pain worse with IR, relieved with ER.",se:63,sp:73},
    {id:"painfulArc",n:"Painful Arc",p:"Impingement/RC",bi:true,desc:"Active abduction. Note exact arc of pain.",interp:"POSITIVE (60-120°): Subacromial impingement. >120°: AC joint.",se:74,sp:81},
  ]},
  elbow:{lb:"Elbow",ic:"◑",bi:true,cx:["Lateral epicondylopathy","Medial epicondylopathy","UCL","Cubital tunnel"],ts:[
    {id:"cozen",n:"Cozen's Test",p:"Lateral epicondylopathy",bi:true,desc:"Forearm pronated. Patient resists wrist extension + radial deviation.",interp:"POSITIVE: Lateral epicondyle/ECRB pain. Tennis elbow.",se:85,sp:72},
    {id:"medEpi",n:"Medial Epicondyle Test",p:"Medial epicondylopathy",bi:true,desc:"Forearm supinated. Patient resists wrist flex + pronation.",interp:"POSITIVE: Medial epicondyle pain. Golfer's elbow.",se:75,sp:70},
    {id:"elbowFlex",n:"Elbow Flexion Test",p:"Cubital tunnel syndrome",bi:true,desc:"Maximally flex elbow. Hold 3 minutes.",interp:"POSITIVE: Ring+little finger tingling within 3 min. Cubital tunnel syndrome.",se:75,sp:99},
  ]},
  wrist:{lb:"Wrist & Hand",ic:"◫",bi:true,cx:["CTS","De Quervain's","Ulnar neuropathy"],ts:[
    {id:"phalens",n:"Phalen's Test",p:"Carpal tunnel syndrome",bi:true,desc:"Maximally flex both wrists. Hold 60 sec.",interp:"POSITIVE: Tingling in thumb/index/middle within 60 sec. CTS confirmed.",se:68,sp:73},
    {id:"finkelstein",n:"Finkelstein's Test",p:"De Quervain's tenosynovitis",bi:true,desc:"Tuck thumb into fist. Apply passive ulnar deviation.",interp:"POSITIVE: Sharp radial styloid pain. Pathognomonic for De Quervain's.",se:81,sp:50},
    {id:"froment",n:"Froment's Sign",p:"Ulnar nerve palsy",bi:true,desc:"Patient holds paper between thumb+index. Examiner pulls away.",interp:"POSITIVE: Thumb IP flexes (FPL compensating). Ulnar nerve palsy.",se:93,sp:95},
  ]},
  hip:{lb:"Hip",ic:"◐",bi:true,cx:["Hip OA","FAI","Labral pathology","Gluteal tendinopathy"],ts:[
    {id:"hipFADIR",n:"FADIR Test",p:"FAI/labral pathology",bi:true,desc:"Hip 90°. Passively adduct + IR to end-range.",interp:"POSITIVE: Deep groin pain or click. FAI, labral tear, or hip OA.",se:78,sp:10},
    {id:"hipFABER",n:"FABER Test",p:"Hip/SIJ",bi:true,desc:"Figure-4. Gravity + overpressure to knee.",interp:"POSITIVE: Groin=hip. Posterior=SIJ. Lateral=TFL/bursitis.",se:57,sp:71},
    {id:"trend",n:"Trendelenburg Test",p:"Gluteus medius weakness",bi:true,desc:"Stand one leg 30 sec. Observe contralateral pelvis.",interp:"POSITIVE: Contralateral pelvis drops. Gluteus medius weakness.",se:73,sp:77},
    {id:"thomas",n:"Thomas Test",p:"Hip flexor length",bi:true,desc:"Supine at table edge. Both knees to chest. Lower test leg.",interp:"POSITIVE: Test leg in hip flexion = hip flexor tight. Knee fails = rectus femoris tight.",se:68,sp:58},
  ]},
  knee:{lb:"Knee",ic:"◔",bi:true,cx:["ACL","Meniscal","PFPS","Knee OA"],ts:[
    {id:"lachman",n:"Lachman Test",p:"ACL integrity",bi:true,desc:"Supine, knee 20-30°. Stabilise femur. Pull tibia anteriorly.",interp:"POSITIVE: >3mm anterior translation or soft end-feel. Gold standard for ACL.",se:87,sp:93},
    {id:"mcmurray",n:"McMurray's Test",p:"Meniscal pathology",bi:true,desc:"Full knee flex. Medial: ER+valgus+ext. Lateral: IR+varus+ext.",interp:"POSITIVE: Palpable clunk along joint line. Meniscal tear.",se:70,sp:71},
    {id:"thessaly",n:"Thessaly's Test",p:"Meniscal load test",bi:true,desc:"Single leg 20°. Rotate body 3x each direction.",interp:"POSITIVE: Joint line discomfort or catching. More sensitive than McMurray's.",se:89,sp:97},
    {id:"valgusKnee",n:"Valgus Stress Test",p:"MCL integrity",bi:true,desc:"Test at 0° and 30°. Apply valgus force.",interp:"POSITIVE: Medial pain or laxity >5mm. At 30°=isolated MCL.",se:86,sp:94},
    {id:"clarkes",n:"Clarke's Test",p:"PFPS",bi:true,desc:"Supine. Press patella distally, patient contracts quads.",interp:"POSITIVE: Retropatellar pain with quad contraction. PFPS.",se:49,sp:75},
  ]},
  ankle:{lb:"Ankle & Foot",ic:"◿",bi:true,cx:["Ankle instability","Achilles tendinopathy","Plantar fasciopathy"],ts:[
    {id:"antDr",n:"Anterior Drawer (Ankle)",p:"ATFL integrity",bi:true,desc:"Ankle 20° PF. Anterior force to calcaneus.",interp:"POSITIVE: >3mm anterior talar translation or soft end-feel. ATFL sprain/rupture.",se:80,sp:74},
    {id:"thompson",n:"Thompson Test",p:"Achilles tendon rupture",bi:true,desc:"Prone. Squeeze calf. Normal=plantarflexion.",interp:"POSITIVE: No plantarflexion. Complete Achilles tendon rupture.",se:96,sp:93},
    {id:"windlass",n:"Windlass Test",p:"Plantar fasciopathy",bi:true,desc:"Weight-bearing. Dorsiflex great toe to end-range.",interp:"POSITIVE: Medial heel pain reproduced. Plantar fasciopathy. 100% specificity.",se:32,sp:100},
    {id:"silfverskiold",n:"Silfverskiöld Test",p:"Gastroc vs soleus tightness",bi:true,desc:"Ankle DF with knee extended vs knee flexed 90°.",interp:"POSITIVE: DF improved with knee flexed = isolated gastrocnemius tightness.",se:85,sp:80},
  ]},
};

const ORDER = ["cervical","thoracic","lumbar","shoulder","elbow","wrist","hip","knee","ankle"];

const STR: Record<string, any[]> = {
  cervical:[{id:"dnf",n:"Deep Neck Flexors",b:true},{id:"ut",n:"Upper Trapezius",b:true},{id:"de",n:"Deep Cervical Extensors",b:true}],
  thoracic:[{id:"mt",n:"Middle Trapezius",b:true},{id:"lt",n:"Lower Trapezius",b:true},{id:"ser",n:"Serratus Anterior",b:true}],
  lumbar:[{id:"tva",n:"TVA / Core Stability",b:false},{id:"gmax",n:"Gluteus Maximus",b:true},{id:"gmed",n:"Gluteus Medius",b:true}],
  shoulder:[{id:"ss",n:"Supraspinatus",b:true},{id:"is",n:"Infraspinatus",b:true},{id:"lts",n:"Lower Trapezius",b:true},{id:"sas",n:"Serratus Anterior",b:true}],
  elbow:[{id:"bic",n:"Biceps",b:true},{id:"tri",n:"Triceps",b:true},{id:"we",n:"Wrist Extensors (ECRB)",b:true},{id:"wf",n:"Wrist Flexors",b:true}],
  wrist:[{id:"grip",n:"Grip Strength",b:true},{id:"apb",n:"Thumb Abductors (APB)",b:true}],
  hip:[{id:"hgm",n:"Gluteus Maximus",b:true},{id:"hgd",n:"Gluteus Medius",b:true},{id:"hfl",n:"Hip Flexors",b:true},{id:"had",n:"Hip Adductors",b:true}],
  knee:[{id:"vmo",n:"VMO / Quads",b:true},{id:"ham",n:"Hamstrings",b:true}],
  ankle:[{id:"ta",n:"Tibialis Anterior",b:true},{id:"pf",n:"Plantarflexors",b:true}],
};

const TIGHT: Record<string, any[]> = {
  cervical:[{id:"ut_t",n:"Upper Trapezius",t:"Lateral flexion to opposite side"},{id:"lev_t",n:"Levator Scapulae",t:"Flex+rotate to opposite side"},{id:"pm_t",n:"Pec Minor",t:"Scapular retraction test"}],
  thoracic:[{id:"pmaj_t",n:"Pectoralis Major",t:"Horizontal abduction ROM"},{id:"lat_t",n:"Latissimus Dorsi",t:"Shoulder flexion overhead"}],
  lumbar:[{id:"hft",n:"Hip Flexors (Thomas test)",t:"Thomas test result"},{id:"hmt",n:"Hamstrings (SLR°)",t:"Passive SLR range"},{id:"piri",n:"Piriformis",t:"Hip IR in prone"}],
  shoulder:[{id:"pc_t",n:"Posterior Capsule",t:"Cross-arm adduction restriction"},{id:"pmj_t",n:"Pec Major",t:"Horizontal adduction ROM"}],
  hip:[{id:"itb",n:"IT Band/TFL (Ober's)",t:"Ober's test"},{id:"rf",n:"Rectus Femoris (Ely's)",t:"Ely's test"},{id:"add",n:"Hip Adductors",t:"Hip abduction ROM"}],
  knee:[{id:"hk_t",n:"Hamstrings",t:"90-90 SLR angle"},{id:"gc_t",n:"Gastrocnemius",t:"Ankle DF knee extended"}],
  ankle:[{id:"gc_a",n:"Gastrocnemius",t:"Ankle DF knee extended"},{id:"sol",n:"Soleus",t:"Ankle DF knee flexed 90°"}],
};

const MPAT = [
  {id:"squat",n:"Deep Squat",d:"Full squat depth, neutral spine"},
  {id:"hinge",n:"Hip Hinge",d:"Forward bend, spine neutral"},
  {id:"sls",n:"Single Leg Stance",d:"Balance 10+ sec, pelvis level"},
  {id:"overhead",n:"Overhead Reach",d:"Bilateral arms, no trunk lean"},
  {id:"cret",n:"Cervical Retraction",d:"Chin tuck quality"},
  {id:"push",n:"Push Pattern",d:"Push-up, scapular control"},
  {id:"pull",n:"Pull Pattern",d:"Row movement, scapular retraction"},
  {id:"lunge",n:"Lunge",d:"Forward lunge, hip/knee alignment"},
];

const SPECS = [
  {id:"womens",lb:"Women's Health",ic:"◎",ds:"Pelvic floor, pregnancy/postpartum"},
  {id:"ergo",lb:"Ergonomics",ic:"◷",ds:"Workstation & posture"},
  {id:"sports",lb:"Sports Rehab",ic:"◈",ds:"Athletic performance, RTS"},
  {id:"chronic",lb:"Chronic Pain",ic:"◉",ds:"Central sensitisation screen"},
];

const NDI_Q = [
  {q:"Pain intensity",o:["No pain","Very mild","Moderate","Fairly severe","Very severe","Worst imaginable"]},
  {q:"Personal care",o:["Normal, no extra pain","Normal, with extra pain","Slow but independent","Mostly independent","Needs help","Unable"]},
  {q:"Lifting",o:["Heavy, no pain","Heavy, with pain","No heavy floor lifts","No lifts above shoulder","No lifts above waist","Cannot lift"]},
  {q:"Reading",o:["As much as I want, no pain","As much, slight pain","Moderate pain limits","Severe pain limits","Hardly at all","Cannot read"]},
  {q:"Headaches",o:["No headaches","Slight, infrequent","Moderate, infrequent","Moderate, frequent","Severe, frequent","Always present"]},
  {q:"Concentration",o:["Full, no difficulty","Full, slight difficulty","Fair difficulty","Lots of difficulty","Great difficulty","Cannot concentrate"]},
  {q:"Work",o:["As much as I want","Usual work only","Most of usual work","Cannot do usual work","Hardly any","No work at all"]},
  {q:"Driving",o:["No pain","Slight pain","Moderate pain","Cannot drive as long","Hardly at all","Cannot drive"]},
  {q:"Sleeping",o:["No difficulty","<1hr disturbed","1-2hrs disturbed","2-3hrs disturbed","3-5hrs disturbed","5-7hrs disturbed"]},
  {q:"Recreation",o:["All activities, no pain","All, some pain","Most activities","Few activities","Hardly any","None at all"]},
];

const MOD: Record<string,{bg:string;br:string;c:string;ic:string}> = {
  electro:{bg:"#FFF7E0",br:"#EDD060",c:"#7A5A00",ic:"⚡"},
  needle:{bg:"#F2F0FF",br:"#C0B8E8",c:"#3A2090",ic:"◉"},
  tape:{bg:"#E8FFF2",br:"#88D8A8",c:"#185A38",ic:"◫"},
  cup:{bg:"#FFF0F8",br:"#E8A8C8",c:"#801840",ic:"◐"},
  manual:{bg:"#EEF4FF",br:"#A8C0F0",c:"#1A3880",ic:"🤲"},
  edu:{bg:"#F5F0FF",br:"#C0B0E8",c:"#401878",ic:"◷"},
  exercise:{bg:"#F0FAEC",br:"#A0D078",c:"#285010",ic:"◈"},
};

// ─── CSS ──────────────────────────────────────────────────────────────────────
const ASSESSMENT_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=DM+Sans:opsz,wght@9..40,400;9..40,500&display=swap');
  .vya-assessment * { box-sizing: border-box; }
  .vya-assessment {
    --vbg:#F4EFE6;--vw:#fff;--vbr:#2C150A;--vbr2:#3D1A0E;
    --vte:#C4622D;--vor:#E8884A;--vmu:#8A7055;--vbd:#DDD3C0;
    --vpc:#A83030;--vpb:#FDF0F0;--vpbb:#E8B8B8;
    --vnc:#1E6640;--vnb:#EFF9F3;--vnbb:#96D4B0;
    font-family:'DM Sans',sans-serif;color:var(--vbr2);font-size:13px;
    background:var(--vbg);border-radius:12px;padding:16px;
  }
  .vya-assessment .vcard{background:var(--vw);border:1px solid var(--vbd);border-radius:12px;padding:15px;margin-bottom:12px;}
  .vya-assessment .vprog{display:flex;gap:3px;margin-bottom:8px;}
  .vya-assessment .vps{flex:1;height:3px;border-radius:2px;background:var(--vbd);}
  .vya-assessment .vps.vdn{background:var(--vor);}
  .vya-assessment .vps.vac{background:var(--vte);}
  .vya-assessment .vct{font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;color:var(--vbr2);margin-bottom:2px;}
  .vya-assessment .vcs{font-size:11px;color:var(--vmu);margin-bottom:12px;}
  .vya-assessment .vg2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
  .vya-assessment .vfc{grid-column:1/-1;}
  .vya-assessment label.vlbl{display:block;font-size:10px;font-weight:500;color:var(--vmu);text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px;}
  .vya-assessment .vinp{width:100%;padding:7px 9px;border:1px solid var(--vbd);border-radius:7px;font-family:'DM Sans',sans-serif;font-size:12px;background:var(--vbg);color:var(--vbr2);outline:none;transition:border .2s;}
  .vya-assessment .vinp:focus{border-color:var(--vte);background:#fff;}
  .vya-assessment .vta{resize:vertical;min-height:48px;}
  .vya-assessment .vrg{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}
  .vya-assessment .vrb{padding:9px 5px;border:2px solid var(--vbd);border-radius:10px;background:var(--vw);cursor:pointer;text-align:center;transition:all .2s;font-family:inherit;}
  .vya-assessment .vrb:hover{border-color:var(--vor);}
  .vya-assessment .vrb.vsl{border-color:var(--vte);background:#FEF4EE;}
  .vya-assessment .vri{font-size:14px;font-family:'Cormorant Garamond',serif;color:var(--vte);font-weight:600;}
  .vya-assessment .vrl{font-size:10px;font-weight:500;color:var(--vbr2);}
  .vya-assessment .vrb.vsl .vrl{color:var(--vte);}
  .vya-assessment .vrts{display:flex;gap:4px;overflow-x:auto;padding-bottom:3px;margin-bottom:12px;scrollbar-width:none;}
  .vya-assessment .vrts::-webkit-scrollbar{display:none;}
  .vya-assessment .vrt{padding:5px 12px;border-radius:20px;border:1px solid var(--vbd);background:var(--vw);font-size:11px;cursor:pointer;white-space:nowrap;font-family:inherit;color:var(--vmu);}
  .vya-assessment .vrt.va{background:var(--vte);color:#fff;border-color:var(--vte);}
  .vya-assessment .vpct{font-size:9px;background:var(--vpb);border:1px solid var(--vpbb);color:var(--vpc);padding:1px 5px;border-radius:8px;margin-left:4px;}
  .vya-assessment .vtt{width:100%;border-collapse:collapse;}
  .vya-assessment .vtt th{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--vmu);font-weight:500;padding:5px 7px;border-bottom:1px solid var(--vbd);background:var(--vbg);text-align:left;}
  .vya-assessment .vtt th.vctr{text-align:center;}
  .vya-assessment .vtt td{padding:5px 7px;border-bottom:1px solid #EDE5D4;vertical-align:middle;}
  .vya-assessment .vtt tr:last-child td{border-bottom:none;}
  .vya-assessment .viib{background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:5px;font-family:inherit;font-size:11px;font-weight:500;color:var(--vbr2);padding:0;width:100%;text-align:left;}
  .vya-assessment .viib:hover{color:var(--vte);}
  .vya-assessment .viidot{width:14px;height:14px;border-radius:50%;background:var(--vbg);border:1px solid var(--vbd);display:inline-flex;align-items:center;justify-content:center;font-size:8px;color:var(--vmu);flex-shrink:0;}
  .vya-assessment .viidot.vop{background:var(--vte);border-color:var(--vte);color:#fff;}
  .vya-assessment .vdr{background:#FFFCF7;border-left:3px solid var(--vte);padding:8px 12px;}
  .vya-assessment .vtbg{display:flex;gap:3px;justify-content:center;}
  .vya-assessment .vtb{padding:3px 7px;border-radius:5px;border:1px solid;font-size:9px;font-weight:500;cursor:pointer;font-family:inherit;min-width:32px;text-align:center;}
  .vya-assessment .vtb.NT{background:#F2EDE4;border-color:var(--vbd);color:var(--vmu);}
  .vya-assessment .vtb.NT.von{background:#E5DDD0;border-color:var(--vmu);color:var(--vbr2);}
  .vya-assessment .vtb.NEG{background:var(--vnb);border-color:var(--vnbb);color:var(--vnc);}
  .vya-assessment .vtb.NEG.von{background:#CBF0DC;border-color:var(--vnc);font-weight:700;}
  .vya-assessment .vtb.POS{background:var(--vpb);border-color:var(--vpbb);color:var(--vpc);}
  .vya-assessment .vtb.POS.von{background:#FFD0D0;border-color:var(--vpc);font-weight:700;}
  .vya-assessment .vslbl{font-size:8px;font-weight:500;color:var(--vmu);text-align:center;margin-bottom:2px;text-transform:uppercase;}
  .vya-assessment .vbrow{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;}
  .vya-assessment .vbp{padding:9px 18px;border-radius:8px;font-family:inherit;font-size:12px;font-weight:500;cursor:pointer;border:none;background:var(--vte);color:#fff;flex:1;}
  .vya-assessment .vbp:hover{background:#B05520;}
  .vya-assessment .vbp:disabled{background:var(--vbd);color:var(--vmu);cursor:not-allowed;}
  .vya-assessment .vbs{padding:9px 14px;border-radius:8px;font-family:inherit;font-size:12px;font-weight:500;cursor:pointer;border:1px solid var(--vbd);background:var(--vw);color:var(--vmu);}
  .vya-assessment .vbs:hover{border-color:var(--vte);color:var(--vte);}
  .vya-assessment .vbai{background:var(--vbr);color:#F4EFE6;flex:1;font-size:13px;padding:12px 20px;border-radius:10px;display:flex;align-items:center;justify-content:center;gap:8px;border:none;cursor:pointer;font-family:inherit;font-weight:500;}
  .vya-assessment .vbai:hover{background:var(--vbr2);}
  .vya-assessment .vbai:disabled{background:var(--vbd);color:var(--vmu);cursor:not-allowed;}
  .vya-assessment .vspin{width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:vsp .7s linear infinite;}
  @keyframes vsp{to{transform:rotate(360deg);}}
  .vya-assessment .verr{background:var(--vpb);border:1px solid var(--vpbb);border-radius:8px;padding:8px 12px;color:var(--vpc);font-size:11px;margin-top:8px;}
  .vya-assessment .vsuccess{background:var(--vnb);border:1px solid var(--vnbb);border-radius:8px;padding:8px 12px;color:var(--vnc);font-size:11px;margin-top:8px;}
  /* patient search */
  .vya-assessment .vpsw{position:relative;}
  .vya-assessment .vpdrop{position:absolute;top:calc(100% + 3px);left:0;right:0;z-index:50;background:var(--vw);border:1px solid var(--vbd);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.10);max-height:210px;overflow-y:auto;}
  .vya-assessment .vpitem{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--vbd);}
  .vya-assessment .vpitem:last-child{border-bottom:none;}
  .vya-assessment .vpitem:hover{background:#FEF4EE;}
  @media(max-width:600px){.vya-assessment .vg2{grid-template-columns:1fr;}.vya-assessment .vrg{grid-template-columns:repeat(3,1fr);}}
`;

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function modT(s: string) {
  const t=(s||"").toLowerCase();
  if(/ift|tens|ultrasound|russian|nmes|traction/.test(t)) return "electro";
  if(/needl|dry/.test(t)) return "needle";
  if(/tape|kinesio/.test(t)) return "tape";
  if(/cupping/.test(t)) return "cup";
  if(/maitland|mobilisati|manual|mfr|soft tissue/.test(t)) return "manual";
  if(/educati|ergon|advice/.test(t)) return "edu";
  return "exercise";
}
function posC(rid: string, res: Record<string,any>) {
  return Object.values(res[rid]||{}).reduce((n:number,v:any)=>
    v.result==="POS"?n+1:n+(v.left==="POS"?1:0)+(v.right==="POS"?1:0),0);
}
function mobScore(movD: Record<string,any>, tightD: Record<string,any>) {
  let p=0,t=0;
  Object.values(movD||{}).forEach((v:any)=>{t+=3;p+=(v.q==="G"?3:v.q==="F"?2:v.q==="P"?1:0);});
  Object.values(tightD||{}).forEach((v:any)=>{
    ["left","right","single"].forEach(s=>{if(v[s]!=null){t+=3;p+=(3-Math.min(v[s],3));}});
  });
  if(!t) return null;
  const sc=Math.round(p/t*100);
  return{score:sc,grade:sc>=80?"A — Excellent":sc>=60?"B — Good":sc>=40?"C — Fair":"D — Poor",color:sc>=60?"#1E6640":"#A83030"};
}
function ndiPct(ndi: number[]) {
  const s=ndi.reduce((a,b)=>a+b,0);
  const p=Math.round(s/50*100);
  return{pct:p,label:p<=8?"No disability":p<=28?"Mild":p<=48?"Moderate":p<=64?"Severe":"Complete"};
}
function buildPrompt(P:any,C:any,bp:any,ndi:number[],sp:string[],movD:any,tightD:any,loadD:any,vya:any,selR:string[],tRes:any,wom:any,ergo:any,sports:any,chronic:any) {
  const nd=ndiPct(ndi);
  let t=`PATIENT: ${P.name||"?"},${P.age||"?"}y,${P.gender||"?"},Occ:${P.occupation||"?"}\n`;
  t+=`SPECIALTIES: ${sp.join(",")||"General"}\n`;
  t+=`COMPLAINT: ${C.primary||"?"}|Onset:${C.onset||"?"}|NRS:${C.nrs||0}/10\n`;
  t+=`Agg:${C.agg||"?"}|Ease:${C.ease||"?"}|Pattern:${C.pattern||"?"}\n`;
  t+=`NDI:${nd.pct}%(${nd.label})\n`;
  t+=`Lifestyle:Sleep${C.sleep||"?"}h,Stress${C.stress||"?"}/10,Activity:${C.activity||"?"}\n\n`;
  const pr=Object.entries(bp||{}).filter(([,v]:any)=>v&&v.nrs>0);
  if(pr.length) t+=`PAIN:${pr.map(([id,v]:any)=>`${AZ.find(z=>z.id===id)?.lb||id}:NRS${v.nrs}${v.q?` ${v.q}`:""}`).join(",")||"none"}\n\n`;
  const wk=Object.entries(tightD||{}).filter(([,v]:any)=>(v.left||0)>1||(v.right||0)>1||(v.single||0)>1);
  if(wk.length) t+=`TIGHT:${wk.map(([id,v]:any)=>`${id}(G${v.left||v.single||0})`).join(",")}\n`;
  const pm=Object.entries(movD||{}).filter(([,v]:any)=>v.q&&v.q!=="G");
  if(pm.length) t+=`MOV:${pm.map(([id,v]:any)=>`${id}:${v.q}${v.pain?"(pain)":""}`).join(",")}\n`;
  t+=`LOAD:${loadD.level||"?"}|Change:${loadD.change||"?"}|Provoc:${(loadD.pd||[]).join(",")}\n\n`;
  t+=`VYAYAMA:RC:${vya.rc||"?"}|DP:${vya.dp||"?"}|Cen:${vya.cen||"?"}|IrrType:${vya.it||"?"}|SE:${vya.se||"?"}/5\n`;
  if(vya.g1) t+=`Goals:${[vya.g1,vya.g2,vya.g3].filter(Boolean).join("|")}\n`;
  const srt=ORDER.filter(r=>selR.includes(r));
  t+=`\nSPECIAL TESTS:\n`;
  srt.forEach(rid=>{
    const pos:string[]=[],neg:string[]=[];
    (TESTS[rid].ts||[]).forEach((ts:any)=>{
      const rv=(tRes[rid]||{})[ts.id];
      if(!rv) return;
      if(rv.result==="POS") pos.push(ts.n);
      else if(rv.result==="NEG") neg.push(ts.n);
      else{if(rv.left==="POS") pos.push(ts.n+" L");if(rv.right==="POS") pos.push(ts.n+" R");}
    });
    if(pos.length||neg.length) t+=`${TESTS[rid].lb}:POS[${pos.join(",")}] NEG[${neg.join(",")}]\n`;
  });
  if(sp.includes("womens")) t+=`\nWOMENS:PelvicPain${wom.pp||0},Leak:${wom.ul},PGP:${wom.pg},Status:${wom.ps||"?"}\n`;
  if(sp.includes("ergo")) t+=`ERGO:${ergo.ws||"?"},${ergo.hrs||"?"}hrs,Dev:${(ergo.dev||[]).join(",")}\n`;
  if(sp.includes("sports")) t+=`SPORTS:${sports.sp||"?"} ${sports.lv||"?"},RTS:${sports.rts}\n`;
  if(sp.includes("chronic")) t+=`CHRONIC:Dur:${chronic.dur||"?"},Allodynia:${chronic.al},Cat:${chronic.cat||"?"}/5\n`;
  const mb=mobScore(movD,tightD);
  if(mb) t+=`\nMOBILITY:${mb.score}/100-${mb.grade}\n`;
  return t;
}

// ─── CRM patient type ─────────────────────────────────────────────────────────
interface CRMPatient { id:string; name:string; patientCode:string; age?:number|null; phone?:string|null; }

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function AssessmentPage() {
  const {data:session,status:authStatus} = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── CRM patient linking (replaces old const prefilledPatientId) ───────────
  const [linkedPatientId, setLinkedPatientId] = useState<string>(searchParams.get("patientId")??"");
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<CRMPatient[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(()=>{
    function h(e:MouseEvent){
      if(searchRef.current && !searchRef.current.contains(e.target as Node)) setPatientResults([]);
    }
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[]);

  // Pre-fetch patient details when ?patientId= comes from the URL
  useEffect(()=>{
    const prefilledId = searchParams.get("patientId");
    if(!prefilledId||patientSearch) return;
    (async()=>{
      setSearchLoading(true);
      try{
        const res = await fetch(`/api/patients/${prefilledId}`);
        if(!res.ok) return;
        const json = await res.json();
        const pt: CRMPatient|undefined = json.id ? json : json.patient;
        if(pt?.name){
          setPatientSearch(pt.name);
          setP(prev=>({
            ...prev,
            name:  pt.name,
            phone: pt.phone ?? prev.phone,
            age:   pt.age != null ? String(pt.age) : prev.age,
          }));
        }
      }catch{/* silently ignore */}
      finally{setSearchLoading(false);}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Debounced patient search
  useEffect(()=>{
    if(patientSearch.length<2){setPatientResults([]);return;}
    const t=setTimeout(async()=>{
      setSearchLoading(true);
      try{
        const res=await fetch(`/api/patients?search=${encodeURIComponent(patientSearch)}&limit=8`);
        const data=await res.json();
        setPatientResults(data.data??data.patients??[]);
      }catch{setPatientResults([]);}
      finally{setSearchLoading(false);}
    },300);
    return()=>clearTimeout(t);
  },[patientSearch]);

  // ── Form state ────────────────────────────────────────────────────────────
  const [step,setStep] = useState(0);
  const [P,setP] = useState({name:"",age:"",gender:"",phone:"",occupation:"",dominantHand:"Right",referredBy:"",therapist:"Dr. Sayalee Pethe",doa:""});
  const [sp,setSp] = useState<string[]>([]);
  const [bp,setBp] = useState<Record<string,any>>({});
  const [selZ,setSelZ] = useState<string|null>(null);
  const [cv,setCv] = useState("front");
  const [C,setC] = useState({primary:"",onset:"",mechanism:"",nrs:5,agg:"",ease:"",pattern:"",limits:"",prevTx:"",hx:"",sleep:"7",stress:4,activity:"Moderately active",breathing:"Diaphragmatic",hydration:"",screen:""});
  const [ndi,setNdi] = useState<number[]>(Array(10).fill(0));
  const [showNdi,setShowNdi] = useState(false);
  const [strD,setStrD] = useState<Record<string,any>>({});
  const [tightD,setTightD] = useState<Record<string,any>>({});
  const [movD,setMovD] = useState<Record<string,any>>({});
  const [loadD,setLoadD] = useState({level:"Moderately loaded",change:"No change",pd:[] as string[],notes:""});
  const [vya,setVya] = useState({rc:"",dp:"Not tested",cen:"Not tested",it:"",se:3,g1:"",g2:"",g3:"",dep:"",lr:"",note:""});
  const [wom,setWom] = useState<Record<string,any>>({pp:0,ul:false,pg:false,ps:"Not pregnant",del:""});
  const [ergo,setErgo] = useState<Record<string,any>>({ws:"",hrs:"",dev:[]});
  const [sports,setSports] = useState({sp:"",lv:"Recreational",rts:false});
  const [chronic,setChron] = useState<Record<string,any>>({dur:"",al:false,cat:3,sd:false});
  const [selR,setSelR] = useState<string[]>([]);
  const [tRes,setTRes] = useState<Record<string,any>>({});
  const [tTab,setTTab] = useState(0);
  const [expKey,setExpKey] = useState<string|null>(null);
  const [loading,setLoading] = useState(false);
  const [lMsg,setLMsg] = useState("");
  const [aiDx,setAiDx] = useState<any>(null);
  const [aiDocs,setAiDocs] = useState<any>(null);
  const [rTab,setRTab] = useState("vm");
  const [err,setErr] = useState("");
  const [saveStatus,setSaveStatus] = useState<"idle"|"saving"|"saved"|"error">("idle");
  const [savedId,setSavedId] = useState<string|null>(null);
  const [copied,setCopied] = useState("");

  const sortedR=ORDER.filter(r=>selR.includes(r));

  useEffect(()=>{
    if(authStatus==="authenticated"&&session?.user?.role==="PATIENT") router.replace("/patient/dashboard");
  },[authStatus,session,router]);

  function setRes(rid:string,tid:string,side:string,val:string){
    setTRes((p:any)=>({...p,[rid]:{...p[rid],[tid]:{...(p[rid]||{})[tid]||{},[side]:val}}}));
  }
  function cp(text:string,key:string){
    try{navigator.clipboard.writeText(text);}catch{}
    setCopied(key);setTimeout(()=>setCopied(""),2200);
  }
  function resetAll(){
    setStep(0);
    setLinkedPatientId(""); setPatientSearch(""); setPatientResults([]);
    setP({name:"",age:"",gender:"",phone:"",occupation:"",dominantHand:"Right",referredBy:"",therapist:"Dr. Sayalee Pethe",doa:""});
    setSp([]);setBp({});setSelZ(null);setCv("front");
    setC({primary:"",onset:"",mechanism:"",nrs:5,agg:"",ease:"",pattern:"",limits:"",prevTx:"",hx:"",sleep:"7",stress:4,activity:"Moderately active",breathing:"Diaphragmatic",hydration:"",screen:""});
    setNdi(Array(10).fill(0));setShowNdi(false);
    setStrD({});setTightD({});setMovD({});
    setLoadD({level:"Moderately loaded",change:"No change",pd:[],notes:""});
    setVya({rc:"",dp:"Not tested",cen:"Not tested",it:"",se:3,g1:"",g2:"",g3:"",dep:"",lr:"",note:""});
    setWom({pp:0,ul:false,pg:false,ps:"Not pregnant",del:""});
    setErgo({ws:"",hrs:"",dev:[]});setSports({sp:"",lv:"Recreational",rts:false});
    setChron({dur:"",al:false,cat:3,sd:false});
    setSelR([]);setTRes({});setAiDx(null);setAiDocs(null);setErr("");setSavedId(null);setSaveStatus("idle");
  }

  // ── Field helpers ─────────────────────────────────────────────────────────
  function fld(label:string,val:any,onChange:(e:React.ChangeEvent<HTMLInputElement>)=>void,ph?:string,type="text"){
    return(<div style={{marginBottom:8}}><label className="vlbl">{label}</label><input type={type} className="vinp" value={val} onChange={onChange} placeholder={ph||""}/></div>);
  }
  function sel(label:string,val:any,onChange:(e:React.ChangeEvent<HTMLSelectElement>)=>void,opts:any[]){
    return(<div style={{marginBottom:8}}><label className="vlbl">{label}</label><select className="vinp" value={val} onChange={onChange}>{opts.map((o,i)=><option key={i} value={Array.isArray(o)?o[0]:o}>{Array.isArray(o)?o[1]:o}</option>)}</select></div>);
  }
  function ta(label:string,val:any,onChange:(e:React.ChangeEvent<HTMLTextAreaElement>)=>void,ph?:string){
    return(<div style={{marginBottom:8}}><label className="vlbl">{label}</label><textarea className="vinp vta" value={val} onChange={onChange} placeholder={ph||""}/></div>);
  }
  function nrsSlider(label:string,val:number,onChange:(e:React.ChangeEvent<HTMLInputElement>)=>void,max?:number,fmt?:(v:number)=>string){
    return(<div style={{marginBottom:8}}><label className="vlbl">{label}</label><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:28,height:28,borderRadius:"50%",background:"var(--vte)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:600,flexShrink:0}}>{val}</div><input type="range" min="0" max={max||10} value={val} onChange={onChange} style={{flex:1,accentColor:"var(--vte)"}}/>{fmt&&<span style={{fontSize:10,color:"var(--vmu)",minWidth:80}}>{fmt(val)}</span>}</div></div>);
  }
  function chip2(label:string,active:boolean,onClick:()=>void,abg?:string,ac?:string,ab?:string){
    return(<button key={label} onClick={onClick} style={{padding:"3px 9px",borderRadius:10,border:`1px solid ${active?(ab||"var(--vpbb)"):"var(--vbd)"}`,background:active?(abg||"var(--vpb)"):"var(--vw)",color:active?(ac||"var(--vpc)"):"var(--vmu)",fontSize:9,cursor:"pointer",fontFamily:"DM Sans,sans-serif",marginRight:3,marginBottom:3}}>{label}</button>);
  }

  // ── Body chart ────────────────────────────────────────────────────────────
  function renderBodyChart(){
    const zones=cv==="front"?FZ:BZ;
    const selZoneData=AZ.find(z=>z.id===selZ);
    const pain=selZ?(bp[selZ]||{nrs:0,q:""}):{nrs:0,q:""};
    return(
      <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
        <div>
          <div style={{display:"flex",gap:6,marginBottom:8,justifyContent:"center"}}>
            {["front","back"].map(v=>(<button key={v} onClick={()=>{setCv(v);setSelZ(null);}} style={{padding:"4px 14px",borderRadius:20,border:"1px solid var(--vbd)",background:cv===v?"var(--vte)":"var(--vw)",color:cv===v?"#fff":"var(--vmu)",fontSize:11,cursor:"pointer",fontFamily:"DM Sans,sans-serif"}}>{v==="front"?"▶ Front":"◀ Back"}</button>))}
          </div>
          <svg width="200" height="335" viewBox="0 0 200 335">
            <ellipse cx="100" cy="36" rx="26" ry="29" fill="#EBE6DC" stroke="#DDD3C0" strokeWidth="1"/>
            <rect x="88" y="66" width="24" height="17" rx="5" fill="#EBE6DC" stroke="#DDD3C0" strokeWidth="1"/>
            <ellipse cx="64" cy="93" rx="21" ry="17" fill="#EBE6DC" stroke="#DDD3C0" strokeWidth="1"/>
            <ellipse cx="136" cy="93" rx="21" ry="17" fill="#EBE6DC" stroke="#DDD3C0" strokeWidth="1"/>
            <rect x="77" y="82" width="46" height="94" rx="7" fill="#EBE6DC" stroke="#DDD3C0" strokeWidth="1"/>
            <rect x="44" y="92" width="20" height="68" rx="8" fill="#EBE6DC" stroke="#DDD3C0" strokeWidth="1"/>
            <rect x="136" y="92" width="20" height="68" rx="8" fill="#EBE6DC" stroke="#DDD3C0" strokeWidth="1"/>
            <rect x="72" y="172" width="24" height="30" rx="7" fill="#EBE6DC" stroke="#DDD3C0" strokeWidth="1"/>
            <rect x="104" y="172" width="24" height="30" rx="7" fill="#EBE6DC" stroke="#DDD3C0" strokeWidth="1"/>
            <rect x="72" y="204" width="24" height="120" rx="8" fill="#EBE6DC" stroke="#DDD3C0" strokeWidth="1"/>
            <rect x="104" y="204" width="24" height="120" rx="8" fill="#EBE6DC" stroke="#DDD3C0" strokeWidth="1"/>
            {zones.map((z:any)=>{
              const p:any=bp[z.id]||{nrs:0};const isSel=selZ===z.id;
              const fill=pCol(p.nrs);
              const stroke=isSel?"#C4622D":p.nrs>0?"rgba(0,0,0,0.2)":"rgba(0,0,0,0.06)";
              const sw=isSel?2:1;
              const common:any={fill,stroke,strokeWidth:sw,style:{cursor:"pointer"},onClick:()=>setSelZ(isSel?null:z.id)};
              return z.s==="e"?<ellipse key={z.id} cx={z.cx} cy={z.cy} rx={z.rx} ry={z.ry} {...common}/>:<rect key={z.id} x={z.x} y={z.y} width={z.w} height={z.h} rx={z.r||4} {...common}/>;
            })}
          </svg>
          <div style={{fontSize:9,color:"var(--vmu)",textAlign:"center",marginTop:2}}>Tap any region to mark pain</div>
        </div>
        <div style={{flex:1,minWidth:130}}>
          {selZ&&selZoneData?(
            <div style={{background:"var(--vw)",border:"1px solid var(--vbd)",borderRadius:10,padding:10,marginBottom:8}}>
              <div style={{fontSize:11,fontWeight:500,color:"var(--vbr2)",marginBottom:6}}>{(selZoneData as any).lb}</div>
              {nrsSlider("Pain intensity",pain.nrs,(e)=>setBp({...bp,[selZ!]:{...pain,nrs:+e.target.value}}))}
              <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:4}}>
                {["Aching","Burning","Sharp","Throbbing","Shooting","Tingling","Numbness"].map(q=>(<button key={q} onClick={()=>setBp({...bp,[selZ!]:{...pain,q}})} style={{padding:"2px 7px",borderRadius:10,border:`1px solid ${pain.q===q?"var(--vte)":"var(--vbd)"}`,background:pain.q===q?"var(--vte)":"var(--vw)",color:pain.q===q?"#fff":"var(--vmu)",fontSize:9,cursor:"pointer",fontFamily:"DM Sans,sans-serif"}}>{q}</button>))}
              </div>
              {pain.nrs>0&&<button onClick={()=>{setBp({...bp,[selZ!]:{nrs:0,q:""}});setSelZ(null);}} style={{marginTop:5,fontSize:9,color:"var(--vpc)",background:"none",border:"none",cursor:"pointer"}}>Clear</button>}
            </div>
          ):<div style={{fontSize:11,color:"var(--vmu)",padding:"10px 0"}}>← Tap a body region</div>}
          {Object.entries(bp).filter(([,v]:any)=>v&&v.nrs>0).map(([id,v]:any)=>(
            <div key={id} style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:pCol(v.nrs),flexShrink:0}}/>
              <span style={{fontSize:10,flex:1,color:"var(--vbr2)"}}>{AZ.find(z=>z.id===id)?.lb||id}</span>
              <span style={{fontSize:10,color:"var(--vmu)"}}>{v.nrs}/10</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Strength / Tightness ──────────────────────────────────────────────────
  function renderStrength(){
    const muscles=sortedR.flatMap(rid=>(STR[rid]||[]).map((m:any)=>({...m,rid})));
    if(!muscles.length) return <div style={{color:"var(--vmu)",fontSize:11,padding:"8px 0"}}>Select regions above to see muscle strength assessment</div>;
    return(
      <div>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:4,marginBottom:4}}>
          {["Muscle","Left","Right"].map(h=><div key={h} style={{fontSize:9,color:"var(--vmu)",textTransform:"uppercase",letterSpacing:".4px",padding:"3px 6px",background:"var(--vbg)",borderRadius:4}}>{h}</div>)}
        </div>
        {muscles.map((m:any)=>{
          const d=strD[m.id]||{};
          function mkStrSel(side:string){const cur=d[side];return<select key={side} value={cur!=null?String(cur):""} onChange={(e)=>{const v=e.target.value===""?null:+e.target.value;setStrD((p:any)=>({...p,[m.id]:{...p[m.id],[side]:v}}))}  } style={{width:"100%",padding:"3px 4px",borderRadius:5,border:`1px solid ${cur!=null&&cur<4?"var(--vpbb)":"var(--vbd)"}`,background:cur!=null&&cur<4?"var(--vpb)":"var(--vbg)",color:cur!=null&&cur<4?"var(--vpc)":"var(--vbr2)",fontSize:10,fontFamily:"DM Sans,sans-serif",fontWeight:cur!=null&&cur<4?600:400}}><option value="">—</option>{[0,1,2,3,4,5].map(v=><option key={v} value={v}>{v}</option>)}</select>;}
          return(<div key={m.id} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:4,marginBottom:4,alignItems:"center"}}><div style={{fontSize:11,color:"var(--vbr2)",padding:"0 4px"}}>{m.n}</div>{m.b?<>{mkStrSel("left")}{mkStrSel("right")}</>:<div style={{gridColumn:"span 2"}}>{mkStrSel("single")}</div>}</div>);
        })}
        <div style={{fontSize:9,color:"var(--vmu)",marginTop:5,padding:"3px 7px",background:"var(--vbg)",borderRadius:4}}>0=No contraction · 3=Against gravity · 5=Normal · <span style={{color:"var(--vpc)"}}>Red=deficit(&lt;4)</span></div>
      </div>
    );
  }
  function renderTightness(){
    const muscles=sortedR.flatMap(rid=>(TIGHT[rid]||[]).map((m:any)=>({...m,rid})));
    if(!muscles.length) return <div style={{color:"var(--vmu)",fontSize:11,padding:"8px 0"}}>Select regions above to see tightness assessment</div>;
    return(
      <div>
        <div style={{display:"grid",gridTemplateColumns:"1.8fr 1.5fr 1fr 1fr",gap:4,marginBottom:4}}>
          {["Muscle","Length Test","L","R"].map(h=><div key={h} style={{fontSize:9,color:"var(--vmu)",textTransform:"uppercase",letterSpacing:".4px",padding:"3px 6px",background:"var(--vbg)",borderRadius:4}}>{h}</div>)}
        </div>
        {muscles.map((m:any)=>{
          const d=tightD[m.id]||{};
          function mkTightSel(side:string){const cur=d[side];return<select key={side} value={cur!=null?String(cur):""} onChange={(e)=>{const v=e.target.value===""?null:+e.target.value;setTightD((p:any)=>({...p,[m.id]:{...p[m.id],[side]:v}}))}  } style={{width:"100%",padding:"2px 3px",borderRadius:5,border:`1px solid ${cur>0?"var(--vte)":"var(--vbd)"}`,background:cur>0?"#FFF3E8":"var(--vbg)",color:cur>0?"var(--vte)":"var(--vbr2)",fontSize:10,fontFamily:"DM Sans,sans-serif",fontWeight:cur>0?600:400}}><option value="">—</option>{[0,1,2,3].map(v=><option key={v} value={v}>{v}</option>)}</select>;}
          return(<div key={m.id} style={{display:"grid",gridTemplateColumns:"1.8fr 1.5fr 1fr 1fr",gap:4,marginBottom:4,alignItems:"center"}}><div style={{fontSize:11,color:"var(--vbr2)",padding:"0 4px"}}>{m.n}</div><div style={{fontSize:9,color:"var(--vmu)",padding:"0 3px",lineHeight:1.3}}>{m.t}</div>{mkTightSel("left")}{mkTightSel("right")}</div>);
        })}
        <div style={{fontSize:9,color:"var(--vmu)",marginTop:5,padding:"3px 7px",background:"var(--vbg)",borderRadius:4}}>0=Normal · 1=Mild(&lt;25%) · 2=Moderate(25-50%) · <span style={{color:"var(--vte)"}}>3=Severe(&gt;50%)</span></div>
      </div>
    );
  }
  function renderMobScore(){
    const mb=mobScore(movD,tightD);
    if(!mb) return <div style={{fontSize:11,color:"var(--vmu)",textAlign:"center",padding:"6px"}}>Score will appear as you complete movement and tightness data</div>;
    return(
      <div style={{background:mb.score>=60?"var(--vnb)":"var(--vpb)",border:`1px solid ${mb.score>=60?"var(--vnbb)":"var(--vpbb)"}`,borderRadius:10,padding:"11px 14px",display:"flex",alignItems:"center",gap:12}}>
        <div style={{textAlign:"center",flexShrink:0}}><div style={{fontFamily:"Cormorant Garamond,serif",fontSize:28,fontWeight:600,color:mb.color,lineHeight:1}}>{mb.score}</div><div style={{fontSize:9,color:mb.color,textTransform:"uppercase",letterSpacing:".4px"}}>/100</div></div>
        <div style={{flex:1}}><div style={{fontSize:14,fontWeight:500,color:mb.color,fontFamily:"Cormorant Garamond,serif",marginBottom:4}}>{mb.grade}</div><div style={{height:6,borderRadius:3,background:"rgba(0,0,0,0.1)",overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,background:mb.color,width:mb.score+"%"}}/></div><div style={{fontSize:9,color:mb.color,marginTop:3}}>Based on movement quality + muscle tightness</div></div>
      </div>
    );
  }

  // ── runAI ─────────────────────────────────────────────────────────────────
  async function runAI(){
    setLoading(true);setErr("");setAiDx(null);setAiDocs(null);
    const summary=buildPrompt(P,C,bp,ndi,sp,movD,tightD,loadD,vya,selR,tRes,wom,ergo,sports,chronic);
    const mob=mobScore(movD,tightD);
    try{
      setLMsg("Analysing clinical findings…");
      const r1=await fetch("/api/ai/assess",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"diagnosis",summary,mobGrade:mob?.grade??null})});
      const d1=await r1.json();if(!r1.ok) throw new Error(d1.error||"AI request failed");
      setAiDx(d1.result);
      setLMsg("Generating Vyayāma Method Report…");
      const r2=await fetch("/api/ai/assess",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"documents",summary,mobGrade:mob?.grade??null,primaryDx:d1.result?.dx?.[0]?.n??"?"})});
      const d2=await r2.json();if(!r2.ok) throw new Error(d2.error||"AI request failed");
      setAiDocs(d2.result);setStep(9);
    }catch(e:any){setErr("⚠ "+e.message);}
    finally{setLoading(false);setLMsg("");}
  }

  // ── Save to CRM — uses linkedPatientId ────────────────────────────────────
  async function saveAssessment(publishStatus:"DRAFT"|"PUBLISHED"="DRAFT"){
    if(!aiDx) return;
    setSaveStatus("saving");
    try{
      const res=await fetch("/api/assessments",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          patientId: linkedPatientId||null,   // ← state, never P.patientId
          assessmentData:{P,sp,bp,C,ndi,strD,tightD,movD,loadD,vya,wom,ergo,sports,chronic,selR,tRes},
          aiDiagnosis:aiDx,aiDocuments:aiDocs,status:publishStatus,
        }),
      });
      const data=await res.json();
      if(!res.ok) throw new Error(data.error);
      setSavedId(data.assessment.id);setSaveStatus("saved");
      setTimeout(()=>setSaveStatus("idle"),3000);
    }catch(e:any){setSaveStatus("error");setErr("Save failed: "+e.message);}
  }

  // ── Report renderer ───────────────────────────────────────────────────────
  function renderReport(){
    if(!aiDx) return null;
    const d=aiDx; const docs=aiDocs||{}; const mob=mobScore(movD,tightD);
    const phC=["#C4622D","#D47830","#B87040","#9A5A30"];
    return(
      <div>
        {d.flags?.filter((f:string)=>f&&f!=="...").length>0&&(
          <div style={{background:"#FDF5F5",border:"1px solid #F0CCCC",borderRadius:8,padding:"8px 12px",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:600,color:"#C0392B",marginBottom:3}}>🚩 Red Flags — Immediate Review Required</div>
            {d.flags.map((f:string,i:number)=><div key={i} style={{fontSize:11,color:"#983020"}}>• {f}</div>)}
          </div>
        )}
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
          <span style={{padding:"4px 10px",borderRadius:16,fontSize:10,fontWeight:500,background:"#FEF4EE",color:"var(--vte)",border:"1px solid #F0B898"}}>Irritability: {d.irr||"?"}</span>
          <span style={{padding:"4px 10px",borderRadius:16,fontSize:10,fontWeight:500,background:"var(--vbg)",color:"var(--vbr2)",border:"1px solid var(--vbd)"}}>Stage: {d.stage||"?"}</span>
          <span style={{padding:"4px 10px",borderRadius:16,fontSize:10,fontWeight:500,background:"#FFF7EE",color:"#B06020",border:"1px solid #F0C888"}}>{d.load||"?"}</span>
          {mob&&<span style={{padding:"4px 10px",borderRadius:16,fontSize:10,fontWeight:500,background:mob.score>=60?"var(--vnb)":"var(--vpb)",color:mob.color,border:`1px solid ${mob.score>=60?"var(--vnbb)":"var(--vpbb)"}`}}>Mobility: {mob.grade}</span>}
        </div>
        {d.inv&&(
          <div style={{background:"var(--vbr)",color:"#F4EFE6",borderRadius:10,padding:"11px 14px",marginBottom:10}}>
            <div style={{fontSize:9,opacity:.65,letterSpacing:".5px",textTransform:"uppercase",marginBottom:2}}>Recommended Investment Plan</div>
            <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:17,color:"#E8884A"}}>Phase {d.inv.ph} — {d.inv.nm} · {d.inv.sess} sessions · {d.inv.pr}</div>
            <div style={{fontSize:11,opacity:.8,marginTop:2}}>{d.inv.why}</div>
          </div>
        )}
        {d.prog&&(
          <div style={{background:"var(--vw)",border:"1px solid var(--vbd)",borderRadius:9,padding:"9px 13px",marginBottom:10,display:"flex",gap:14,flexWrap:"wrap",alignItems:"center"}}>
            <div><div style={{fontSize:9,color:"var(--vmu)",textTransform:"uppercase",letterSpacing:".4px"}}>Sessions</div><div style={{fontSize:16,fontWeight:500,color:"var(--vte)",fontFamily:"Cormorant Garamond,serif"}}>{d.prog.sess}</div></div>
            <div><div style={{fontSize:9,color:"var(--vmu)",textTransform:"uppercase",letterSpacing:".4px"}}>Timeline</div><div style={{fontSize:16,fontWeight:500,color:"var(--vte)",fontFamily:"Cormorant Garamond,serif"}}>{d.prog.wks} weeks</div></div>
            <div style={{flex:1}}>{(d.prog.fac||[]).filter((f:string)=>f&&f!=="...").map((f:string,i:number)=><span key={i} style={{fontSize:10,padding:"2px 7px",borderRadius:10,background:"var(--vbg)",border:"1px solid var(--vbd)",color:"var(--vmu)",marginRight:4,display:"inline-block",marginBottom:2}}>{f}</span>)}</div>
          </div>
        )}
        <div style={{display:"flex",gap:4,overflowX:"auto",marginBottom:12,scrollbarWidth:"none"}}>
          {[["vm","⊕ Vyayāma Report"],["dx","Diagnoses"],["plan","Rehab Plan"],["soap","SOAP"],["hep","HEP Sheet"],["docs","Documents"]].map(([id,lb])=>(<button key={id} onClick={()=>setRTab(id)} style={{padding:"5px 12px",borderRadius:20,border:"1px solid var(--vbd)",background:rTab===id?"var(--vte)":"var(--vw)",color:rTab===id?"#fff":"var(--vmu)",fontSize:11,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"DM Sans,sans-serif",flexShrink:0}}>{lb}</button>))}
        </div>
        {rTab==="vm"&&docs.vm&&(
          <div>
            <div style={{background:"var(--vbr)",borderRadius:10,padding:"13px 15px",marginBottom:10}}>
              <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:18,fontWeight:600,color:"#F4EFE6",marginBottom:2}}>Vyayāma Physio — Clinical Reasoning Report</div>
              <div style={{fontSize:10,color:"#E8884A"}}>Dr. Sayalee Pethe · B.P.Th, PG Diploma Manual Therapy · M.I.A.P 63221 · {new Date().toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})}</div>
              {P.name&&<div style={{fontSize:11,color:"rgba(244,239,230,0.8)",marginTop:4}}>Patient: {P.name} · {P.age||"?"}y · {P.occupation||"—"}</div>}
            </div>
            {[["Pain as Information",docs.vm.pi,"#FEF4EE","#F0B898","var(--vte)"],["Root Cause Analysis",docs.vm.rca,"#EFF9F3","var(--vnbb)","var(--vnc)"],["Movement Prescription",docs.vm.mp,"#EEF4FF","#A8C0F0","#1A3880"],["Lifestyle Integration Plan",docs.vm.lp,"#F5F0FF","#C0B0E8","#401878"],["3-Month Outcome Target",docs.vm.t3m,"#FFF7E0","#EDD060","#7A5A00"],["Clinician Note",docs.vm.cn,"#FFFBF5","#F0D8B0","var(--vte)"]].map(([title,content,bg,brd,tc])=>content&&(content as string).length>3?(
              <div key={title as string} style={{background:bg as string,border:`1px solid ${brd}`,borderRadius:9,padding:"10px 13px",marginBottom:8}}>
                <div style={{fontSize:9,fontWeight:500,color:tc as string,textTransform:"uppercase",letterSpacing:".4px",marginBottom:4}}>{title}</div>
                <div style={{fontSize:12,color:"var(--vbr2)",lineHeight:1.7}}>{content}</div>
              </div>
            ):null)}
            {(d.movRx||[]).filter((m:string)=>m&&m!=="...").length>0&&(<div style={{background:"#F0FAEC",border:"1px solid #A0D078",borderRadius:9,padding:"10px 13px",marginBottom:8}}><div style={{fontSize:9,fontWeight:500,color:"#285010",textTransform:"uppercase",letterSpacing:".4px",marginBottom:4}}>◈ Movement Rx</div>{d.movRx.filter((m:string)=>m&&m!=="...").map((m:string,i:number)=><div key={i} style={{fontSize:12,color:"var(--vbr2)",padding:"2px 0"}}>→ {m}</div>)}</div>)}
            {(d.lifeRx||[]).filter((l:string)=>l&&l!=="...").length>0&&(<div style={{background:"#FFF3E8",border:"1px solid #F0B070",borderRadius:9,padding:"10px 13px",marginBottom:8}}><div style={{fontSize:9,fontWeight:500,color:"#803010",textTransform:"uppercase",letterSpacing:".4px",marginBottom:4}}>◎ Lifestyle Modifications</div>{d.lifeRx.filter((l:string)=>l&&l!=="...").map((l:string,i:number)=><div key={i} style={{fontSize:12,color:"var(--vbr2)",padding:"2px 0"}}>→ {l}</div>)}</div>)}
            <button onClick={()=>cp(`VYAYĀMA PHYSIO — CLINICAL REASONING REPORT\nPatient: ${P.name||"—"}, ${P.age||"?"}y\nDate: ${new Date().toLocaleDateString("en-IN")}\n\n${docs.vm.pi||""}\n\n${docs.vm.rca||""}`,"vm")} style={{fontSize:10,padding:"5px 14px",borderRadius:8,background:copied==="vm"?"var(--vnb)":"var(--vw)",border:"1px solid var(--vbd)",color:copied==="vm"?"var(--vnc)":"var(--vmu)",cursor:"pointer",fontFamily:"DM Sans,sans-serif"}}>{copied==="vm"?"✓ Copied":"Copy Report"}</button>
          </div>
        )}
        {rTab==="dx"&&(
          <div>
            {(d.dx||[]).map((dx:any)=>(
              <div key={dx.r} style={{border:"1px solid var(--vbd)",borderRadius:10,padding:12,marginBottom:8,background:"var(--vw)"}}>
                <div style={{display:"flex",alignItems:"center",marginBottom:4}}>
                  <span style={{width:20,height:20,borderRadius:"50%",background:"var(--vte)",color:"#fff",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600,marginRight:8,flexShrink:0}}>{dx.r}</span>
                  <span style={{fontFamily:"Cormorant Garamond,serif",fontSize:15,fontWeight:600,color:"var(--vbr2)",flex:1}}>{dx.n}</span>
                  <span style={{fontSize:11,color:"var(--vte)",fontWeight:500}}>{dx.c}%</span>
                  <span style={{fontSize:9,color:"var(--vmu)",marginLeft:7}}>{dx.icd}</span>
                </div>
                <div style={{height:4,borderRadius:2,background:"var(--vbd)",marginBottom:6,overflow:"hidden"}}><div style={{height:"100%",borderRadius:2,background:"linear-gradient(90deg,var(--vor),var(--vte))",width:(dx.c||0)+"%"}}/></div>
                {dx.why&&<div style={{fontSize:11,color:"var(--vmu)",fontStyle:"italic",marginBottom:5}}>{dx.why}</div>}
                <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                  {(dx.for||[]).filter((f:string)=>f&&f!=="...").map((f:string,i:number)=><span key={i} style={{fontSize:9,padding:"2px 7px",borderRadius:10,background:"var(--vnb)",color:"var(--vnc)",border:"1px solid var(--vnbb)"}}>✓ {f}</span>)}
                  {(dx.against||[]).filter((f:string)=>f&&f!=="...").map((f:string,i:number)=><span key={i} style={{fontSize:9,padding:"2px 7px",borderRadius:10,background:"var(--vpb)",color:"var(--vpc)",border:"1px solid var(--vpbb)"}}>✗ {f}</span>)}
                </div>
              </div>
            ))}
            {(d.yf||[]).filter((y:string)=>y&&y!=="...").length>0&&(<div style={{background:"#FFF3E8",border:"1px solid #F0B070",borderRadius:9,padding:"9px 13px"}}><div style={{fontSize:9,fontWeight:500,color:"#803010",textTransform:"uppercase",letterSpacing:".4px",marginBottom:4}}>Yellow Flags</div>{d.yf.filter((y:string)=>y&&y!=="...").map((f:string,i:number)=><div key={i} style={{fontSize:11,color:"var(--vbr2)"}}>• {f}</div>)}</div>)}
          </div>
        )}
        {rTab==="plan"&&(
          <div>
            {["p1","p2","p3","p4"].map((pk,i)=>{
              const ph=d.plan?.[pk]; if(!ph) return null;
              return(
                <div key={pk} style={{border:"1px solid var(--vbd)",borderRadius:10,overflow:"hidden",marginBottom:10,background:"var(--vw)"}}>
                  <div style={{padding:"8px 12px",background:phC[i]+"18",borderBottom:`2px solid ${phC[i]}30`,display:"flex",alignItems:"center",gap:7}}>
                    <div style={{width:20,height:20,borderRadius:"50%",background:phC[i],color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600,flexShrink:0}}>P{i+1}</div>
                    <span style={{fontFamily:"Cormorant Garamond,serif",fontSize:14,fontWeight:600,color:"var(--vbr2)"}}>{ph.t}</span>
                    <span style={{marginLeft:"auto",fontSize:9,padding:"2px 7px",borderRadius:10,background:"var(--vbg)",border:"1px solid var(--vbd)",color:"var(--vmu)"}}>⏱ {ph.d}</span>
                    <span style={{fontSize:9,padding:"2px 7px",borderRadius:10,background:"var(--vbg)",border:"1px solid var(--vbd)",color:"var(--vmu)"}}>{ph.f}</span>
                  </div>
                  {(ph.g||[]).filter((g:string)=>g&&g!=="...").length>0&&(<div style={{padding:"6px 12px",borderBottom:"1px solid var(--vbd)",background:"#FFFBF7",display:"flex",flexWrap:"wrap",gap:4}}>{ph.g.filter((g:string)=>g&&g!=="...").map((g:string,j:number)=><span key={j} style={{fontSize:10,padding:"2px 8px",borderRadius:12,background:"var(--vnb)",color:"var(--vnc)",border:"1px solid var(--vnbb)"}}>→ {g}</span>)}</div>)}
                  <div style={{padding:"8px 12px",display:"flex",flexDirection:"column",gap:4}}>
                    {(ph.rx||[]).filter((r:string)=>r&&r!=="...").map((item:string,j:number)=>{const mt=modT(item);const cfg=MOD[mt];return(<div key={j} style={{display:"flex",alignItems:"flex-start",gap:6,padding:"4px 8px",borderRadius:7,background:cfg.bg,border:`1px solid ${cfg.br}`,color:cfg.c,fontSize:11}}><span style={{flexShrink:0}}>{cfg.ic}</span><span>{item}</span></div>);})}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {rTab==="soap"&&docs.soap&&(
          <div>
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:7}}>
              <button onClick={()=>cp(`S: ${docs.soap.s}\n\nO: ${docs.soap.o}\n\nA: ${docs.soap.a}\n\nP: ${docs.soap.p}`,"soap")} style={{fontSize:10,padding:"4px 12px",borderRadius:8,background:copied==="soap"?"var(--vnb)":"var(--vw)",border:"1px solid var(--vbd)",color:copied==="soap"?"var(--vnc)":"var(--vmu)",cursor:"pointer",fontFamily:"DM Sans,sans-serif"}}>{copied==="soap"?"✓ Copied":"Copy SOAP"}</button>
            </div>
            {[["S","Subjective",docs.soap.s],["O","Objective",docs.soap.o],["A","Assessment",docs.soap.a],["P","Plan",docs.soap.p]].map(([l,lb,c])=>(
              <div key={l} style={{background:"var(--vw)",border:"1px solid var(--vbd)",borderRadius:9,marginBottom:7,overflow:"hidden"}}>
                <div style={{padding:"6px 12px",background:"var(--vbg)",borderBottom:"1px solid var(--vbd)",display:"flex",gap:7,alignItems:"center"}}>
                  <span style={{width:19,height:19,borderRadius:"50%",background:"var(--vte)",color:"#fff",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,flexShrink:0}}>{l}</span>
                  <span style={{fontSize:11,fontWeight:500,color:"var(--vbr2)"}}>{lb}</span>
                </div>
                <div style={{padding:"8px 12px",fontSize:12,color:"var(--vbr2)",lineHeight:1.7}}>{c}</div>
              </div>
            ))}
          </div>
        )}
        {rTab==="hep"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <div style={{fontSize:11,color:"var(--vmu)"}}>Phase 1 — Home Exercise Programme</div>
              <button onClick={()=>cp((d.hep||[]).map((e:any,i:number)=>`${i+1}. ${e.n}\n   ${e.s}×${e.r} | ${e.f}\n   ${e.c}`).join("\n\n"),"hep")} style={{fontSize:10,padding:"4px 11px",borderRadius:8,background:copied==="hep"?"var(--vnb)":"var(--vw)",border:"1px solid var(--vbd)",color:copied==="hep"?"var(--vnc)":"var(--vmu)",cursor:"pointer",fontFamily:"DM Sans,sans-serif"}}>{copied==="hep"?"✓ Copied":"Copy HEP"}</button>
            </div>
            {(d.hep||[]).map((ex:any,i:number)=>(
              <div key={i} style={{border:"1px solid var(--vbd)",borderRadius:8,padding:"9px 11px",marginBottom:7,background:"var(--vw)",display:"flex",gap:9}}>
                <div style={{background:"var(--vbg)",borderRadius:6,width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Cormorant Garamond,serif",color:"var(--vte)",fontWeight:600,flexShrink:0}}>{i+1}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:500,color:"var(--vbr2)"}}>{ex.n}</div>
                  <div style={{display:"flex",gap:5,margin:"3px 0"}}><span style={{fontSize:9,background:"var(--vbg)",border:"1px solid var(--vbd)",color:"var(--vmu)",padding:"2px 6px",borderRadius:8}}>{ex.s}×{ex.r}</span><span style={{fontSize:9,background:"var(--vbg)",border:"1px solid var(--vbd)",color:"var(--vmu)",padding:"2px 6px",borderRadius:8}}>{ex.f}</span></div>
                  <div style={{fontSize:10,color:"var(--vmu)"}}>{ex.c}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {rTab==="docs"&&(
          <div>
            {docs.ptR&&(<div style={{background:"var(--vw)",border:"1px solid var(--vbd)",borderRadius:9,marginBottom:9,overflow:"hidden"}}><div style={{padding:"6px 12px",background:"var(--vbg)",borderBottom:"1px solid var(--vbd)",display:"flex",alignItems:"center",justifyContent:"space-between"}}><span style={{fontSize:11,fontWeight:500,color:"var(--vbr2)"}}>Patient-Friendly Explanation</span><button onClick={()=>cp(docs.ptR,"pt")} style={{fontSize:10,padding:"3px 9px",borderRadius:7,background:copied==="pt"?"var(--vnb)":"var(--vw)",border:"1px solid var(--vbd)",color:copied==="pt"?"var(--vnc)":"var(--vmu)",cursor:"pointer",fontFamily:"DM Sans,sans-serif"}}>{copied==="pt"?"✓":"Copy"}</button></div><div style={{padding:"8px 12px",fontSize:12,color:"var(--vbr2)",lineHeight:1.7}}>{docs.ptR}</div></div>)}
            {docs.wa&&(<div style={{background:"var(--vw)",border:"1px solid #90D8B0",borderRadius:9,marginBottom:9,overflow:"hidden"}}><div style={{padding:"6px 12px",background:"#E8F8F0",borderBottom:"1px solid #90D8B0",display:"flex",alignItems:"center",justifyContent:"space-between"}}><span style={{fontSize:11,fontWeight:500,color:"#1A5A38"}}>📱 WhatsApp Message</span><button onClick={()=>cp(docs.wa,"wa")} style={{fontSize:10,padding:"3px 9px",borderRadius:7,background:copied==="wa"?"var(--vnb)":"var(--vw)",border:"1px solid var(--vbd)",color:copied==="wa"?"var(--vnc)":"var(--vmu)",cursor:"pointer",fontFamily:"DM Sans,sans-serif"}}>{copied==="wa"?"✓":"Copy"}</button></div><div style={{padding:"8px 12px",fontSize:12,color:"var(--vbr2)",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{docs.wa}</div></div>)}
            {docs.sc&&(<div style={{background:"var(--vw)",border:"1px solid var(--vbd)",borderRadius:9,overflow:"hidden"}}><div style={{padding:"6px 12px",background:"var(--vbg)",borderBottom:"1px solid var(--vbd)"}}><span style={{fontSize:11,fontWeight:500,color:"var(--vbr2)"}}>Investment Plan Scripts</span></div>{docs.sc.as&&<div style={{padding:"9px 12px",borderBottom:"1px solid var(--vbd)"}}><div style={{fontSize:9,color:"var(--vmu)",textTransform:"uppercase",letterSpacing:".4px",marginBottom:3}}>Post-assessment</div><div style={{fontSize:11,color:"var(--vbr2)",lineHeight:1.7,fontStyle:"italic"}}>"{docs.sc.as}"</div></div>}{docs.sc.up&&<div style={{padding:"9px 12px"}}><div style={{fontSize:9,color:"var(--vmu)",textTransform:"uppercase",letterSpacing:".4px",marginBottom:3}}>Phase upgrade</div><div style={{fontSize:11,color:"var(--vbr2)",lineHeight:1.7,fontStyle:"italic"}}>"{docs.sc.up}"</div></div>}</div>)}
          </div>
        )}
        <div style={{fontSize:9,color:"var(--vmu)",textAlign:"center",padding:"10px 0 4px",lineHeight:1.6,opacity:.8}}>
          ⚕ AI-assisted provisional classification only. Supports but does not replace qualified physiotherapist judgment.<br/>
          Vyayāma Physio · Dr. Sayalee Pethe, B.P.Th, PG Diploma Manual Therapy · M.I.A.P 63221 · Bengaluru
        </div>
        <div className="vbrow">
          <button className="vbs" onClick={()=>setStep(8)}>← Revise</button>
          {saveStatus==="saved"?(
            <div className="vsuccess" style={{flex:1,textAlign:"center",margin:0,padding:"9px 18px",borderRadius:8}}>
              ✓ Saved {savedId?`(…${savedId.slice(-6)})`:""}{linkedPatientId?" · Linked to CRM":" · Unlinked"}
            </div>
          ):(
            <button className="vbp" style={{flex:1}} onClick={()=>saveAssessment("DRAFT")} disabled={saveStatus==="saving"}>
              {saveStatus==="saving"?"Saving…":"💾 Save Draft"}
            </button>
          )}
          <button
            className="vbp"
            style={{background:linkedPatientId?"var(--vnc)":"var(--vmu)",position:"relative"}}
            onClick={()=>{
              if(!linkedPatientId){
                setErr("⚠ No patient linked — link a CRM patient first so the report can be published to their portal.");
                return;
              }
              saveAssessment("PUBLISHED");
            }}
            disabled={saveStatus==="saving"}
            title={linkedPatientId?"Publish to patient portal":"Link a patient first"}
          >🚀 Publish to Patient{!linkedPatientId&&<span style={{fontSize:9,marginLeft:4,opacity:.8}}>(link required)</span>}</button>
          <button className="vbp" onClick={resetAll}>↺ New</button>
        </div>
        {err&&<div className="verr">{err}</div>}
      </div>
    );
  }

  // ─── MAIN RENDER ──────────────────────────────────────────────────────────
  const SLABS=["Patient","Pain Map","Complaint","Strength","Movement","Tests","Vyayāma","Specialty","Generate","Report"];

  if(authStatus==="loading") return(
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading…</div>
  );

  return(
    <>
      <style>{ASSESSMENT_CSS}</style>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Assessment</h1>
        <p className="text-sm text-gray-500 mt-1">Complete MSK Assessment · Strength &amp; Tightness · Mobility Score · Vyayāma Method Report</p>
      </div>

      <div className="vya-assessment">
        <div className="vprog">
          {SLABS.map((_,i)=><div key={i} className={`vps ${i<step?"vdn":i===step?"vac":""}`}/>)}
        </div>

        {/* ── STEP 0: PATIENT ─────────────────────────────────────────────── */}
        {step===0&&(
          <div className="vcard">
            <div className="vct">Patient Registration</div>
            <div className="vcs">Search and link a CRM patient, then fill assessment details</div>

            {/* ── CRM Patient Search ──────────────────────────────────────── */}
            <div style={{background:"var(--vbg)",border:"1px solid var(--vbd)",borderRadius:9,padding:"12px 13px",marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:600,color:"var(--vbr2)",marginBottom:6}}>
                Link CRM Patient
                <span style={{fontWeight:400,color:"var(--vmu)",marginLeft:6,fontSize:10}}>(optional — allows publishing to patient portal)</span>
              </div>

              {/* Search input + dropdown */}
              <div className="vpsw" ref={searchRef}>
                <input
                  type="text"
                  className="vinp"
                  placeholder="Search by name or patient code…"
                  value={patientSearch}
                  autoComplete="off"
                  style={{background:"var(--vw)",paddingRight:linkedPatientId?"32px":"9px"}}
                  onChange={e=>{
                    setPatientSearch(e.target.value);
                    // If user clears the field, unlink
                    if(!e.target.value){setLinkedPatientId("");}
                  }}
                />
                {/* Spinner */}
                {searchLoading&&(
                  <div style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",width:12,height:12,border:"2px solid var(--vbd)",borderTopColor:"var(--vte)",borderRadius:"50%",animation:"vsp .7s linear infinite"}}/>
                )}
                {/* Clear / unlink button */}
                {linkedPatientId&&!searchLoading&&(
                  <button
                    onClick={()=>{setLinkedPatientId("");setPatientSearch("");setPatientResults([]);}}
                    style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"var(--vmu)",fontSize:14,lineHeight:1,padding:"2px 4px"}}
                    title="Unlink patient"
                  >✕</button>
                )}
                {/* Dropdown results */}
                {patientResults.length>0&&!linkedPatientId&&(
                  <div className="vpdrop">
                    {patientResults.map(pt=>(
                      <div
                        key={pt.id}
                        className="vpitem"
                        onMouseDown={e=>{
                          e.preventDefault(); // prevent input blur before click
                          setLinkedPatientId(pt.id);
                          setPatientSearch(pt.name);
                          setP(prev=>({
                            ...prev,
                            name: pt.name,
                            phone: pt.phone??prev.phone,
                            age: pt.age!=null?String(pt.age):prev.age,
                          }));
                          setPatientResults([]);
                        }}
                      >
                        <span style={{fontWeight:500,color:"var(--vbr2)"}}>{pt.name}</span>
                        <span style={{fontSize:10,color:"var(--vmu)"}}>{pt.patientCode}{pt.age?` · ${pt.age}y`:""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Status badge */}
              {linkedPatientId?(
                <div style={{marginTop:8,display:"flex",alignItems:"center",gap:6,fontSize:10,color:"var(--vnc)",background:"var(--vnb)",border:"1px solid var(--vnbb)",borderRadius:7,padding:"6px 10px"}}>
                  <span style={{fontSize:12}}>✓</span>
                  <span style={{flex:1}}>Linked — CRM ID: {linkedPatientId}</span>
                </div>
              ):(
                <div style={{marginTop:8,fontSize:10,color:"var(--vmu)"}}>
                  ⚠ No patient linked — assessment will be saved as unlinked walk-in
                </div>
              )}
            </div>

            {/* ── Manual / auto-filled patient fields ─────────────────────── */}
            <div className="vg2">
              <div>{fld("Full Name",P.name,(e)=>setP({...P,name:e.target.value}),"Patient name")}</div>
              <div>{fld("Date of Assessment",P.doa,(e)=>setP({...P,doa:e.target.value}),"","date")}</div>
              <div>{fld("Age (years)",P.age,(e)=>setP({...P,age:e.target.value}),"Years","number")}</div>
              <div>{sel("Gender",P.gender,(e)=>setP({...P,gender:e.target.value}),["","Male","Female","Other"])}</div>
              <div>{fld("Contact",P.phone,(e)=>setP({...P,phone:e.target.value}),"+91")}</div>
              <div>{fld("Occupation",P.occupation,(e)=>setP({...P,occupation:e.target.value}),"e.g. Software Engineer")}</div>
              <div>{fld("Referred By",P.referredBy,(e)=>setP({...P,referredBy:e.target.value}),"Self / Doctor")}</div>
              <div>{sel("Dominant Hand",P.dominantHand,(e)=>setP({...P,dominantHand:e.target.value}),["Right","Left","Bilateral"])}</div>
            </div>

            {/* ── Specialty modules ────────────────────────────────────────── */}
            <div style={{marginTop:10}}>
              <div style={{fontSize:11,fontWeight:500,color:"var(--vbr2)",marginBottom:3}}>Specialty modules</div>
              <div style={{fontSize:11,color:"var(--vmu)",marginBottom:8}}>Select all that apply</div>
              <div className="vrg">
                {SPECS.map(s=>{const isSel=sp.includes(s.id);return(
                  <button key={s.id} className={`vrb ${isSel?"vsl":""}`} onClick={()=>setSp(isSel?sp.filter(x=>x!==s.id):[...sp,s.id])}>
                    <div className="vri">{s.ic}</div><div className="vrl">{s.lb}</div>
                    <div style={{fontSize:9,color:isSel?"var(--vte)":"var(--vmu)",marginTop:2,lineHeight:1.3}}>{s.ds}</div>
                  </button>
                );})}
              </div>
            </div>
            <div className="vbrow"><button className="vbp" onClick={()=>setStep(1)}>Next — Pain Map →</button></div>
          </div>
        )}

        {/* ── STEP 1: BODY CHART ───────────────────────────────────────────── */}
        {step===1&&(
          <div className="vcard">
            <div className="vct">Body Pain Map</div>
            <div className="vcs">Select Front / Back. Tap any region to mark pain intensity (0–10) and quality.</div>
            {renderBodyChart()}
            <div className="vbrow"><button className="vbs" onClick={()=>setStep(0)}>← Back</button><button className="vbp" onClick={()=>setStep(2)}>Next — Complaint →</button></div>
          </div>
        )}

        {/* ── STEP 2: COMPLAINT + LIFESTYLE + NDI ─────────────────────────── */}
        {step===2&&(
          <div className="vcard">
            <div className="vct">Chief Complaint, History &amp; Lifestyle</div>
            <div className="vcs">Subjective assessment · lifestyle screen · NDI outcome measure</div>
            <div className="vg2">
              <div className="vfc">{fld("Primary Complaint",C.primary,(e)=>setC({...C,primary:e.target.value}),"e.g. Right shoulder pain radiating to arm, worse with overhead activity")}</div>
              <div>{fld("Onset",C.onset,(e)=>setC({...C,onset:e.target.value}),"e.g. 3 months ago, gradual")}</div>
              <div>{fld("Mechanism",C.mechanism,(e)=>setC({...C,mechanism:e.target.value}),"e.g. Lifting, fall, insidious, postural")}</div>
              <div className="vfc">{nrsSlider("Pain Intensity — NRS",C.nrs,(e)=>setC({...C,nrs:+e.target.value}),10,v=>v>=8?"Severe":v>=5?"Moderate":v>=3?"Mild":"Minimal")}</div>
              <div>{ta("Aggravating Factors",C.agg,(e)=>setC({...C,agg:e.target.value}),"What makes it worse?")}</div>
              <div>{ta("Easing Factors",C.ease,(e)=>setC({...C,ease:e.target.value}),"What makes it better?")}</div>
              <div>{ta("24-Hour Pattern",C.pattern,(e)=>setC({...C,pattern:e.target.value}),"Worse AM/PM/constant/intermittent?")}</div>
              <div>{ta("Functional Limitations",C.limits,(e)=>setC({...C,limits:e.target.value}),"What can they not do?")}</div>
              <div>{fld("Previous Treatment",C.prevTx,(e)=>setC({...C,prevTx:e.target.value}),"Physio, medications, injections...")}</div>
              <div>{fld("Relevant History / Imaging",C.hx,(e)=>setC({...C,hx:e.target.value}),"Comorbidities, MRI/X-ray...")}</div>
            </div>
            <div style={{background:"var(--vbg)",borderRadius:9,border:"1px solid var(--vbd)",padding:"12px 13px",marginTop:10}}>
              <div style={{fontSize:11,fontWeight:500,color:"var(--vbr2)",marginBottom:8}}>Lifestyle Screen</div>
              <div className="vg2">
                <div>{fld("Sleep (hrs/night)",C.sleep,(e)=>setC({...C,sleep:e.target.value}),"e.g. 7","number")}</div>
                <div>{nrsSlider("Stress Level (0–10)",C.stress,(e)=>setC({...C,stress:+e.target.value}))}</div>
                <div>{sel("Physical Activity Level",C.activity,(e)=>setC({...C,activity:e.target.value}),["Sedentary (desk, minimal activity)","Lightly active (1-2 days/wk)","Moderately active (3-4 days/wk)","Very active (5+ days/wk)","Athletic / competitive"])}</div>
                <div>{sel("Breathing Pattern",C.breathing,(e)=>setC({...C,breathing:e.target.value}),["Diaphragmatic","Chest dominant","Paradoxical","Mouth breathing","Not assessed"])}</div>
                <div>{fld("Water Intake (L/day)",C.hydration,(e)=>setC({...C,hydration:e.target.value}),"e.g. 1.5")}</div>
                <div>{fld("Screen Time outside work (hrs)",C.screen,(e)=>setC({...C,screen:e.target.value}),"e.g. 3")}</div>
              </div>
            </div>
            <div style={{marginTop:10,background:"var(--vw)",border:"1px solid var(--vbd)",borderRadius:9,overflow:"hidden"}}>
              <div style={{padding:"7px 12px",background:"var(--vbg)",borderBottom:"1px solid var(--vbd)",display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:11,fontWeight:500,color:"var(--vbr2)"}}>Neck Disability Index (NDI)</span>
                <button onClick={()=>setShowNdi(!showNdi)} style={{marginLeft:"auto",fontSize:10,color:"var(--vte)",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,sans-serif"}}>{showNdi?"Hide ▲":"Expand ▼"}</button>
                {(()=>{const{pct,label}=ndiPct(ndi);return(<div style={{padding:"2px 9px",borderRadius:10,background:pct<=8?"var(--vnb)":pct<=28?"#FFF7E0":"var(--vpb)",border:`1px solid ${pct<=8?"var(--vnbb)":pct<=28?"#EDD060":"var(--vpbb)"}`,color:pct<=8?"var(--vnc)":pct<=28?"#7A5A00":"var(--vpc)",fontSize:10,fontWeight:500}}>{pct}% — {label}</div>);})()}
              </div>
              {showNdi&&(
                <div style={{padding:"10px 12px"}}>
                  {NDI_Q.map((item,i)=>(
                    <div key={i} style={{marginBottom:8}}>
                      <div style={{fontSize:11,fontWeight:500,color:"var(--vbr2)",marginBottom:4}}>{i+1}. {item.q}</div>
                      {item.o.map((opt,j)=>(<label key={j} style={{display:"flex",alignItems:"center",gap:6,padding:"2px 0",cursor:"pointer"}}><input type="radio" name={`ndi_${i}`} checked={ndi[i]===j} onChange={()=>{const a=[...ndi];a[i]=j;setNdi(a);}} style={{accentColor:"var(--vte)"}}/><span style={{fontSize:11,color:ndi[i]===j?"var(--vte)":"var(--vmu)"}}>{opt} <span style={{fontSize:9,color:"var(--vbd)"}}>[{j}]</span></span></label>))}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="vbrow"><button className="vbs" onClick={()=>setStep(1)}>← Back</button><button className="vbp" onClick={()=>setStep(3)}>Next — Strength &amp; Tightness →</button></div>
          </div>
        )}

        {/* ── STEP 3: STRENGTH + TIGHTNESS ────────────────────────────────── */}
        {step===3&&(
          <div className="vcard">
            <div className="vct">Muscle Strength &amp; Tightness</div>
            <div className="vcs">Select regions below · Oxford 0–5 strength grading · Tightness grade 0–3</div>
            <div className="vrg" style={{marginBottom:14}}>
              {ORDER.map(rid=>{const isSel=selR.includes(rid);return(
                <button key={rid} className={`vrb ${isSel?"vsl":""}`} onClick={()=>setSelR(isSel?selR.filter(x=>x!==rid):[...selR,rid])}>
                  <div className="vri">{TESTS[rid].ic}</div><div className="vrl">{TESTS[rid].lb}</div>
                  {isSel&&<div style={{fontSize:8,color:"var(--vte)"}}>✓</div>}
                </button>
              );})}
            </div>
            <div style={{background:"var(--vbg)",borderRadius:9,padding:"12px 13px",marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:500,color:"var(--vbr2)",marginBottom:8}}>Muscle Strength — Oxford Scale (0–5)</div>
              {renderStrength()}
            </div>
            <div style={{background:"var(--vbg)",borderRadius:9,padding:"12px 13px"}}>
              <div style={{fontSize:12,fontWeight:500,color:"var(--vbr2)",marginBottom:8}}>Muscle Tightness — Grade (0–3)</div>
              {renderTightness()}
            </div>
            <div className="vbrow"><button className="vbs" onClick={()=>setStep(2)}>← Back</button><button className="vbp" onClick={()=>setStep(4)}>Next — Movement Patterns →</button></div>
          </div>
        )}

        {/* ── STEP 4: MOVEMENT + LOAD + MOBILITY ──────────────────────────── */}
        {step===4&&(
          <div className="vcard">
            <div className="vct">Movement Patterns &amp; Load Assessment</div>
            <div className="vcs">Grade functional movement quality · assess load tolerance · mobility score</div>
            <div style={{background:"var(--vbg)",borderRadius:9,padding:"12px 13px",marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:500,color:"var(--vbr2)",marginBottom:8}}>Movement Pattern Quality</div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1.5fr 1fr",gap:4,marginBottom:4}}>
                {["Pattern","Quality","Pain?"].map(h=><div key={h} style={{fontSize:9,color:"var(--vmu)",textTransform:"uppercase",letterSpacing:".4px",padding:"3px 6px",background:"var(--vbg)",borderRadius:4}}>{h}</div>)}
              </div>
              {MPAT.map(mp=>{
                const d=movD[mp.id]||{q:"",pain:false};
                return(
                  <div key={mp.id} style={{display:"grid",gridTemplateColumns:"2fr 1.5fr 1fr",gap:4,marginBottom:6,alignItems:"center"}}>
                    <div><div style={{fontSize:11,fontWeight:500,color:"var(--vbr2)"}}>{mp.n}</div><div style={{fontSize:9,color:"var(--vmu)"}}>{mp.d}</div></div>
                    <div style={{display:"flex",gap:3}}>
                      {[["G","Good","#1E6640","#EFF9F3"],["F","Fair","#8A5500","#FFF7E0"],["P","Poor","#A83030","#FDF0F0"],["NT","—","#8A7055","#F2EDE4"]].map(([v,l,c,bg])=>(<button key={v} onClick={()=>setMovD({...movD,[mp.id]:{...d,q:v}})} style={{padding:"3px 5px",borderRadius:5,border:`1px solid ${d.q===v?c:"var(--vbd)"}`,background:d.q===v?bg:"var(--vw)",color:d.q===v?c:"var(--vmu)",fontSize:9,cursor:"pointer",fontFamily:"DM Sans,sans-serif",fontWeight:d.q===v?700:400}}>{l}</button>))}
                    </div>
                    <button onClick={()=>setMovD({...movD,[mp.id]:{...d,pain:!d.pain}})} style={{padding:"3px 8px",borderRadius:7,border:`1px solid ${d.pain?"var(--vpbb)":"var(--vbd)"}`,background:d.pain?"var(--vpb)":"var(--vw)",color:d.pain?"var(--vpc)":"var(--vmu)",fontSize:10,cursor:"pointer",fontFamily:"DM Sans,sans-serif"}}>{d.pain?"Yes":"No"}</button>
                  </div>
                );
              })}
            </div>
            <div style={{marginBottom:12}}>{renderMobScore()}</div>
            <div style={{background:"var(--vbg)",borderRadius:9,padding:"12px 13px"}}>
              <div style={{fontSize:12,fontWeight:500,color:"var(--vbr2)",marginBottom:8}}>Load Assessment</div>
              <div className="vg2">
                <div>{sel("Current load level",loadD.level,(e)=>setLoadD({...loadD,level:e.target.value}),["Sedentary","Lightly loaded","Moderately loaded","Heavily loaded","Athletic / high load"])}</div>
                <div>{sel("Recent load change",loadD.change,(e)=>setLoadD({...loadD,change:e.target.value}),["No change","Sudden increase","Gradual increase","Sudden decrease","Return after rest/injury"])}</div>
                <div className="vfc">
                  <label className="vlbl">Provocative loading directions</label>
                  <div style={{marginTop:4}}>
                    {["Spinal extension","Spinal flexion","Rotation","Axial compression","Sustained postures","Repetitive motion","Impact/running","Lifting"].map(dir=>chip2(dir,loadD.pd.includes(dir),()=>{const p=loadD.pd.includes(dir)?loadD.pd.filter(x=>x!==dir):[...loadD.pd,dir];setLoadD({...loadD,pd:p});}))}
                  </div>
                </div>
                <div className="vfc">{fld("Load notes",loadD.notes,(e)=>setLoadD({...loadD,notes:e.target.value}),"e.g. Pain after 30min sitting, aggravated by overhead...")}</div>
              </div>
            </div>
            <div className="vbrow"><button className="vbs" onClick={()=>setStep(3)}>← Back</button><button className="vbp" onClick={()=>setStep(5)}>Next — Special Tests →</button></div>
          </div>
        )}

        {/* ── STEP 5: SPECIAL TESTS ────────────────────────────────────────── */}
        {step===5&&(
          <>
            <div className="vcard" style={{paddingBottom:10}}>
              <div className="vct">Special Tests</div>
              <div className="vcs">Click ℹ for procedure, interpretation &amp; accuracy. Toggle NT → NEG → POS.</div>
              <div className="vrts">
                {sortedR.map((rid,i)=>{const pc=posC(rid,tRes);return(
                  <button key={rid} className={`vrt ${tTab===i?"va":""}`} onClick={()=>setTTab(i)}>
                    {TESTS[rid].lb}{pc>0&&<span className="vpct">+{pc}</span>}
                  </button>
                );})}
                {!sortedR.length&&<div style={{fontSize:11,color:"var(--vmu)"}}>No regions selected — go back to Step 3</div>}
              </div>
            </div>
            {sortedR[tTab]&&(()=>{
              const rid=sortedR[tTab]; const reg=TESTS[rid];
              return(
                <div className="vcard">
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <div style={{width:28,height:28,background:"var(--vbg)",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Cormorant Garamond,serif",fontSize:14,color:"var(--vte)",fontWeight:600,flexShrink:0}}>{reg.ic}</div>
                    <div><div className="vct" style={{fontSize:15,marginBottom:1}}>{reg.lb}</div><div style={{fontSize:10,color:"var(--vmu)"}}>{reg.cx.join(" · ")}</div></div>
                  </div>
                  <table className="vtt">
                    <thead><tr>
                      <th style={{width:"40%"}}>Test</th>
                      {reg.bi?<><th className="vctr" style={{width:"28%"}}>◀ Left</th><th className="vctr" style={{width:"28%"}}>Right ▶</th></>:<th className="vctr" style={{width:"56%"}}>Result</th>}
                    </tr></thead>
                    <tbody>
                      {reg.ts.map((test:any)=>{
                        const isBil=reg.bi&&test.bi!==false;
                        const rv=(tRes[rid]||{})[test.id]||(isBil?{left:"NT",right:"NT"}:{result:"NT"});
                        const key=`${rid}.${test.id}`; const isOpen=expKey===key;
                        const mkBtns=(side:string,cur:string)=>(
                          <td key={side}>
                            {isBil&&<div className="vslbl">{side==="left"?"L":"R"}</div>}
                            <div className="vtbg">
                              {["NT","NEG","POS"].map(v=><button key={v} className={`vtb ${v} ${cur===v?"von":""}`} onClick={()=>setRes(rid,test.id,side,v)}>{v}</button>)}
                            </div>
                          </td>
                        );
                        return[
                          <tr key={test.id}>
                            <td>
                              <button className="viib" onClick={()=>setExpKey(isOpen?null:key)}>
                                <span className={`viidot ${isOpen?"vop":""}`}>ℹ</span>{test.n}
                              </button>
                              <div style={{fontSize:9,color:"var(--vmu)",marginTop:1}}>{test.p}</div>
                            </td>
                            {isBil?[mkBtns("left",rv.left),mkBtns("right",rv.right)]:mkBtns("result",rv.result)}
                          </tr>,
                          isOpen&&(
                            <tr key={key+"-d"}>
                              <td colSpan={isBil?3:2} style={{padding:0,borderBottom:"1px solid #EDE5D4"}}>
                                <div className="vdr">
                                  <div style={{fontSize:9,fontWeight:500,color:"var(--vmu)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:2}}>Procedure</div>
                                  <div style={{fontSize:11,color:"var(--vbr2)",lineHeight:1.6,marginBottom:6}}>{test.desc}</div>
                                  <div style={{background:"var(--vbg)",borderRadius:6,padding:"6px 9px",marginBottom:5}}>
                                    <div style={{fontSize:9,fontWeight:500,color:"var(--vte)",textTransform:"uppercase",letterSpacing:".4px",marginBottom:2}}>Interpretation</div>
                                    <div style={{fontSize:11,color:"var(--vbr2)",lineHeight:1.5}}>{test.interp}</div>
                                  </div>
                                  {(test.se>0||test.sp>0)&&(
                                    <div style={{display:"flex",gap:12}}>
                                      {test.se>0&&<div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:9,color:"var(--vmu)",fontWeight:500,minWidth:56}}>Sensitivity</span><div style={{height:5,borderRadius:3,background:"var(--vbd)",width:60,overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,background:"#C4622D",width:test.se+"%"}}/></div><span style={{fontSize:9,color:"var(--vmu)"}}>{test.se}%</span></div>}
                                      {test.sp>0&&<div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:9,color:"var(--vmu)",fontWeight:500,minWidth:56}}>Specificity</span><div style={{height:5,borderRadius:3,background:"var(--vbd)",width:60,overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,background:"#1E6640",width:test.sp+"%"}}/></div><span style={{fontSize:9,color:"var(--vmu)"}}>{test.sp}%</span></div>}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        ];
                      })}
                    </tbody>
                  </table>
                  <div style={{display:"flex",gap:6,marginTop:8}}>
                    {tTab>0&&<button className="vbs" style={{flex:1}} onClick={()=>{setTTab(tTab-1);setExpKey(null);}}>← {TESTS[sortedR[tTab-1]].lb}</button>}
                    {tTab<sortedR.length-1&&<button className="vbp" onClick={()=>{setTTab(tTab+1);setExpKey(null);}}>{TESTS[sortedR[tTab+1]].lb} →</button>}
                  </div>
                </div>
              );
            })()}
            <div className="vbrow"><button className="vbs" onClick={()=>setStep(4)}>← Back</button><button className="vbp" onClick={()=>setStep(6)}>Next — Vyayāma Assessment →</button></div>
          </>
        )}

        {/* ── STEP 6: VYAYAMA ─────────────────────────────────────────────── */}
        {step===6&&(
          <div className="vcard">
            <div className="vct">Vyayāma Clinical Assessment</div>
            <div className="vcs">Root cause · directional preference · MDT · patient goals · self-efficacy</div>
            <div className="vg2">
              <div>{sel("Root Cause Classification",vya.rc,(e)=>setVya({...vya,rc:e.target.value}),["","Structural pathology","Movement pattern dysfunction","Load intolerance / deconditioning","Lifestyle contributor (sleep/stress/posture)","Neural sensitisation","Psychosocial / fear avoidance","Mixed — multiple drivers"])}</div>
              <div>{sel("Irritability Type",vya.it,(e)=>setVya({...vya,it:e.target.value}),["","Chemical/Inflammatory (constant, not load-dependent)","Mechanical (load-dependent, settles with rest)","Neural (neurogenic pain behaviour)","Mixed"])}</div>
              <div>{sel("MDT Directional Preference",vya.dp,(e)=>setVya({...vya,dp:e.target.value}),["Not tested","Extension preference","Flexion preference","Lateral shift — Left","Lateral shift — Right","No directional preference","Not applicable"])}</div>
              <div>{sel("Centralisation Response",vya.cen,(e)=>setVya({...vya,cen:e.target.value}),["Not tested","Positive centralisation","Peripheralisation","No change","Not applicable"])}</div>
              <div className="vfc">{nrsSlider("Patient Self-Efficacy (1=Low confidence, 5=Full confidence)",vya.se,(e)=>setVya({...vya,se:+e.target.value}),5,v=>v<=2?"Low confidence":v===3?"Neutral / unsure":v===4?"Fairly confident":"Full confidence")}</div>
              <div>{fld("Patient Goal 1 (PSFS activity)",vya.g1,(e)=>setVya({...vya,g1:e.target.value}),"e.g. Return to badminton")}</div>
              <div>{fld("Patient Goal 2",vya.g2,(e)=>setVya({...vya,g2:e.target.value}),"e.g. Carry groceries without pain")}</div>
              <div>{fld("Load response pattern",vya.lr,(e)=>setVya({...vya,lr:e.target.value}),"e.g. Worse with sustained load, better after movement...")}</div>
              <div>{fld("Movement deprivation areas",vya.dep,(e)=>setVya({...vya,dep:e.target.value}),"e.g. Avoids rotation, stopped gym...")}</div>
              <div className="vfc">
                <label className="vlbl">Clinician's clinical note</label>
                <textarea className="vinp vta" value={vya.note} onChange={(e)=>setVya({...vya,note:e.target.value})} placeholder="Additional observations, reasoning, red flags considered..."/>
              </div>
            </div>
            <div className="vbrow"><button className="vbs" onClick={()=>setStep(5)}>← Back</button><button className="vbp" onClick={()=>setStep(sp.length>0?7:8)}>Next {sp.length>0?"— Specialty Modules →":"— Generate Report →"}</button></div>
          </div>
        )}

        {/* ── STEP 7: SPECIALTY MODULES ───────────────────────────────────── */}
        {step===7&&(
          <div className="vcard">
            <div className="vct">Specialty Assessment Modules</div>
            <div className="vcs">Additional clinical modules for: {sp.map(s=>SPECS.find(x=>x.id===s)?.lb).join(", ")}</div>
            {sp.includes("womens")&&(
              <div style={{background:"#FFF0F8",border:"1px solid #E8A8C8",borderRadius:9,padding:"12px 13px",marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:500,color:"#801840",marginBottom:8}}>◎ Women's Health Module</div>
                <div className="vg2">
                  <div>{sel("Pregnancy / Postpartum Status",wom.ps,(e)=>setWom({...wom,ps:e.target.value}),["Not pregnant","Pregnant — 1st trimester","Pregnant — 2nd trimester","Pregnant — 3rd trimester","Postpartum (<3 months)","Postpartum (3-12 months)","Postpartum (>12 months)"])}</div>
                  <div>{fld("Number of deliveries",wom.del,(e)=>setWom({...wom,del:e.target.value}),"","number")}</div>
                  <div className="vfc">{nrsSlider("Pelvic Pain (NRS 0–10)",wom.pp,(e)=>setWom({...wom,pp:+e.target.value}))}</div>
                  <div className="vfc">
                    <label className="vlbl">Symptoms present</label>
                    <div style={{marginTop:4}}>
                      {[["ul","Stress urinary incontinence"],["pg","Pelvic girdle / pubic symphysis pain"],["dias","Diastasis recti concern"],["disp","Dyspareunia"],["prol","Pelvic organ prolapse symptoms"]].map(([k,l])=>chip2(l,wom[k],()=>setWom({...wom,[k]:!wom[k]}),"#FFF0F8","#801840","#E8A8C8"))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {sp.includes("ergo")&&(
              <div style={{background:"#F5F0FF",border:"1px solid #C0B0E8",borderRadius:9,padding:"12px 13px",marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:500,color:"#401878",marginBottom:8}}>◷ Ergonomics Module</div>
                <div className="vg2">
                  <div>{sel("Workstation type",ergo.ws,(e)=>setErgo({...ergo,ws:e.target.value}),["","Corporate office","Hybrid","Work from home","Laptop only","Desktop + external monitor","Sit-stand desk"])}</div>
                  <div>{fld("Hours at desk/day",ergo.hrs,(e)=>setErgo({...ergo,hrs:e.target.value}),"","number")}</div>
                  <div className="vfc">
                    <label className="vlbl">Postural deviations observed</label>
                    <div style={{marginTop:4}}>
                      {["Forward head posture","Rounded shoulders","Thoracic kyphosis","Lumbar flexion (slouching)","Wrist extension typing (>15°)","Legs crossed","Screen below eye level"].map(d=>chip2(d,(ergo.dev||[]).includes(d),()=>{const devs=(ergo.dev||[]).includes(d)?(ergo.dev||[]).filter((x:string)=>x!==d):[...(ergo.dev||[]),d];setErgo({...ergo,dev:devs});}))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {sp.includes("sports")&&(
              <div style={{background:"#EEF4FF",border:"1px solid #A8C0F0",borderRadius:9,padding:"12px 13px",marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:500,color:"#1A3880",marginBottom:8}}>◈ Sports Rehabilitation Module</div>
                <div className="vg2">
                  <div>{fld("Sport / Activity",sports.sp,(e)=>setSports({...sports,sp:e.target.value}),"e.g. Badminton, running, gym")}</div>
                  <div>{sel("Level",sports.lv,(e)=>setSports({...sports,lv:e.target.value}),["Recreational","Club / social competitive","State / national","Professional"])}</div>
                  <div className="vfc">
                    <label className="vlbl">Return-to-Sport Goal</label>
                    <div style={{display:"flex",gap:6,marginTop:4}}>
                      <button onClick={()=>setSports({...sports,rts:true})} style={{padding:"5px 14px",borderRadius:7,border:`1px solid ${sports.rts?"var(--vnbb)":"var(--vbd)"}`,background:sports.rts?"var(--vnb)":"var(--vw)",color:sports.rts?"var(--vnc)":"var(--vmu)",fontSize:11,cursor:"pointer",fontFamily:"DM Sans,sans-serif"}}>Yes — RTS goal</button>
                      <button onClick={()=>setSports({...sports,rts:false})} style={{padding:"5px 14px",borderRadius:7,border:"1px solid var(--vbd)",background:"var(--vw)",color:"var(--vmu)",fontSize:11,cursor:"pointer",fontFamily:"DM Sans,sans-serif"}}>No</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {sp.includes("chronic")&&(
              <div style={{background:"#F0F0F8",border:"1px solid #C0B8E8",borderRadius:9,padding:"12px 13px"}}>
                <div style={{fontSize:12,fontWeight:500,color:"#3A2090",marginBottom:8}}>◉ Chronic Pain / Central Sensitisation</div>
                <div className="vg2">
                  <div>{fld("Pain duration",chronic.dur,(e)=>setChron({...chronic,dur:e.target.value}),"e.g. 3 months, 2 years")}</div>
                  <div>{nrsSlider("Catastrophising (1–5)",chronic.cat,(e)=>setChron({...chronic,cat:+e.target.value}),5,v=>v<=2?"Low":v===3?"Moderate":"High")}</div>
                  <div className="vfc">
                    <label className="vlbl">Central sensitisation indicators</label>
                    <div style={{marginTop:4}}>
                      {[["al","Allodynia (light touch=pain)"],["sd","Sleep disturbance due to pain"],["spread","Pain spreads beyond original area"],["fatigue","Widespread fatigue"],["anxiety","Movement anxiety/fear"]].map(([k,l])=>chip2(l,chronic[k],()=>setChron({...chronic,[k]:!chronic[k]}),"#F0F0F8","#3A2090","#C0B8E8"))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="vbrow"><button className="vbs" onClick={()=>setStep(6)}>← Back</button><button className="vbp" onClick={()=>setStep(8)}>Next — Generate Report →</button></div>
          </div>
        )}

        {/* ── STEP 8: GENERATE ─────────────────────────────────────────────── */}
        {step===8&&(
          <div className="vcard" style={{textAlign:"center",padding:"22px 16px"}}>
            <div className="vct" style={{textAlign:"center",marginBottom:6}}>Ready to Generate</div>
            <div style={{fontSize:12,color:"var(--vmu)",marginBottom:16}}>AI will generate your Vyayāma Method Report, diagnoses, 4-phase rehab plan, SOAP note, HEP sheet, WhatsApp message and investment scripts.</div>
            <div style={{background:"var(--vbg)",borderRadius:9,padding:"10px 14px",marginBottom:16,textAlign:"left"}}>
              {[
                ["Pain regions marked",Object.values(bp).filter((v:any)=>v&&v.nrs>0).length],
                ["NDI score",ndiPct(ndi).pct+"%"],
                ["Regions assessed",sortedR.length],
                ["Specialties",sp.length>0?sp.join(", "):"General"],
                ["Mobility score",(()=>{const m=mobScore(movD,tightD);return m?m.grade:"Not scored";})()],
                ["CRM patient",linkedPatientId?`Linked (ID …${linkedPatientId.slice(-8)})`:"Unlinked walk-in"],
              ].map(([k,v])=>(
                <div key={k as string} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:"1px solid var(--vbd)",fontSize:11}}>
                  <span style={{color:"var(--vmu)"}}>{k}</span>
                  <span style={{color:k==="CRM patient"&&!linkedPatientId?"var(--vmu)":"var(--vte)",fontWeight:500}}>{v as any}</span>
                </div>
              ))}
            </div>
            {loading&&(
              <div>
                <div style={{width:36,height:36,border:"3px solid var(--vbd)",borderTopColor:"var(--vte)",borderRadius:"50%",animation:"vsp .7s linear infinite",margin:"0 auto 10px"}}/>
                <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:16,color:"var(--vbr2)"}}>{lMsg||"Generating…"}</div>
              </div>
            )}
            {!loading&&(
              <div className="vbrow">
                <button className="vbs" onClick={()=>setStep(sp.length>0?7:6)}>← Back</button>
                <button className="vbai" onClick={runAI}>✦ Generate Vyayāma AI Report</button>
              </div>
            )}
            {err&&<div className="verr">{err}</div>}
          </div>
        )}

        {/* ── STEP 9: REPORT ───────────────────────────────────────────────── */}
        {step===9&&renderReport()}
      </div>
    </>
  );
}