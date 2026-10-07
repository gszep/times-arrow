import Lean
import TimesArrow

/-!
`lake exe timesarrow contract` prints the contract JSON. The other commands
evaluate the reference implementation for randomised differential tests:
`rand <seed> <step> <site>` prints four words, `hpp <seed> <n> <t>` prints
the lattice as one hex digit per site, `hppinv <seed> <n> <t>` prints the
state after undoing `t` steps with the inverse map, `hppecho <seed> <n>
<t>` prints the full Loschmidt-echo result, which must equal the initial
state, and `hppinit <packed|null> <seed> <n>` prints a 001 initial state.
`walkjson <seed> <arm> <n> <m> <t>` prints one 002 trajectory golden and
`walkprofilejson <seed> <arm> <n> <m> <t>` the whole 003 profile vector
(trajectory, per-time occupancies and window sums).
-/

open Lean TimesArrow Philox LatticeGas TimesArrow.Walker

/-- Axioms a proved claim may use. -/
def allowedAxioms : List Name := [``propext, ``Classical.choice, ``Quot.sound]

instance : ToJson UInt32 := ⟨fun x => toJson x.toNat⟩

def block (b : Block) : Json := toJson [b.x0, b.x1, b.x2, b.x3]

def hexState (a : Array UInt32) : String :=
  String.ofList (a.toList.map fun s => Nat.digitChar s.toNat)

/-! ## The walker model of 002 -/

/-- The schedule of an arm name: hop `s ∈ {1..T}` uses `ws s`. The 003
arms are the three-weight profiles; windXOR swaps E ↔ W at step 1 only. -/
def armSched (arm : String) : Option (ℕ → Dir → ℕ) :=
  match arm with
  | "driven" => some (fun _ => drivenW)
  | "reversed" => some (fun _ => reversedW)
  | "null" => some (fun _ => nullW)
  | "ramp" => some rampW
  | "ramprev" => some rampRevW
  | "calm" => some (fun _ => calmW)
  | "w5" => some (fun _ => w5W)
  | "w4" => some (fun _ => w4W)
  | "wind" => some (fun _ => windW)
  | "c2" => some (fun _ => c2W)
  | "max" => some (fun _ => maxW)
  | "h8" => some (fun _ => h8W)
  | "windXOR" => some windXorW
  | _ => none

/-- The schedule of an arm name, as an `IO` action that fails on unknown
arms. -/
def armSchedIO (arm : String) : IO (ℕ → Dir → ℕ) :=
  match armSched arm with
  | some f => pure f
  | none => throw (IO.userError "arm must be a 002 arm (driven, reversed, null, ramp, ramprev) or a 003 arm (calm, w5, w4, wind, c2, max, h8, windXOR)")

/-- Render a float as a decimal string with up to 17 significant digits —
the f64 round-trip bound; Lean's own float printing rounds to 6. -/
def floatDec (f : Float) : String := Id.run do
  if f.isNaN then return "NaN"
  if f == 0 then return "0"
  let neg := f < 0
  let mut x : Float := if neg then -f else f
  let mut e : Int := 0
  while x >= 100000000000000000 do
    x := x / 10
    e := e + 1
  while x < 10000000000000000 do
    x := x * 10
    e := e - 1
  let m := x.floor.toUInt64.toNat
  let digs := toString m
  let digs := if digs.length > 17 then (digs.take 17).toString else digs
  let digs := if digs.length < 17 then
      digs ++ String.ofList ((List.range (17 - digs.length)).map fun _ => '0')
    else digs
  let s := s!"{(digs.take 1).toString}.{(digs.drop 1).toString}e{e + 16}"
  return if neg then "-" ++ s else s

/-- A float marked to be printed as a raw, full-precision JSON number by
`unmarkFloats` (Lean's `ToJson Float` keeps only 6 significant digits). -/
def rawFloat (f : Float) : Json := Json.str s!"#f:{floatDec f}"

/-- Strip the raw-float markers together with their quotes, turning every
marked string into a bare JSON number. -/
def unmarkFloats (s : String) : String :=
  match s.splitOn "\"#f:" with
  | [] => s
  | p0 :: rest =>
    p0 ++ (rest.foldl (fun acc p =>
      match p.splitOn "\"" with
      | f :: tl => acc ++ f ++ "\"".intercalate tl
      | [] => acc) "")

/-- The arm's per-path σ in f64: `(n_E − n_W)·ln (q_E/q_W)` for constant
weights, the per-hop sum for schedules. -/
def sigmaFloat (ws : ℕ → Dir → ℕ) (seed : UInt32) (M T : ℕ) : Float :=
  if T = 0 then 0 else
    if (Array.range T).all (fun s => ws (s + 1) 0 == ws 1 0 && ws (s + 1) 1 == ws 1 1) then
      let tl := pathTally ws seed M T
      ((tl.1 : Int) - tl.2).toFloat * Float.log ((ws 1 0).toFloat / (ws 1 1).toFloat)
    else (Array.range T |>.foldl (fun acc s =>
      let tl := stepTally ws seed M (s + 1)
      let w := ws (s + 1)
      acc + ((tl.1 : Int) - tl.2).toFloat *
        Float.log ((w 0).toFloat / (w 1).toFloat)) 0)

/-- One trajectory golden: the packed final positions as one hex digit each,
`x` then `y`, plus the hop tallies and σ of the path. -/
def walkGolden (seed : UInt32) (arm : String) (n m t : ℕ) : Option Json := do
  let some ws := armSched arm | none
  let sh := n.log2
  guard (2 ^ sh == n)
  let pos := positions sh m ws seed t
  let state := String.ofList ((List.finRange m).flatMap fun i =>
    let p := pos i
    [Nat.digitChar p.1.val, Nat.digitChar p.2.val])
  let tl := pathTally ws seed m t
  return Json.mkObj [
    ("seed", toJson seed), ("arm", toJson arm),
    ("n", toJson n), ("m", toJson m), ("t", toJson t),
    ("state", toJson state),
    ("nE", toJson tl.1), ("nW", toJson tl.2),
    ("tallies", toJson ((Array.range t).map fun s =>
      let v := stepTally ws seed m (s + 1)
      (v.1 : Int) - v.2)),
    ("sigma", rawFloat (sigmaFloat ws seed m t))]

/-- The exact tally distribution of an arm at `T`, as string numerators
over the shared denominator `256^(M·T)`; bin `k` is the probability of
`n_E − n_W = k`. -/
def dpExactJson (w : Dir → ℕ) (m t : ℕ) : Json :=
  let e := m * t
  let num := tallyNumerators w e
  Json.mkObj [
    ("e", toJson e),
    ("den", toJson (toString ((2 : ℕ) ^ (8 * e)))),
    ("bins", toJson (num.mapIdx fun i v =>
      Json.mkObj [("k", toJson ((i : Int) - e)),
        ("num", toJson (toString v))]))]

/-- The same distribution in f64 (for horizons whose numerators exceed
f64 range). -/
def dpFloatJson (w : Dir → ℕ) (m t : ℕ) : Json :=
  Json.mkObj [
    ("e", toJson (m * t)),
    ("bins", toJson ((tallyProbs w (m * t)).map rawFloat))]

/-- A schedule's exact-DP tally distribution in f64. -/
def dpSchedJson (ws : ℕ → Dir → ℕ) (m t : ℕ) : Json :=
  Json.mkObj [
    ("e", toJson (m * t)),
    ("bins", toJson ((schedProbs ws m t).map rawFloat))]

/-- The K5 corner goldens: the KL divergences of the `k`-time count
marginals between the driven and reversed arms, in f64, plus the exact
rational 3-time tables (they agree cell for cell — `kl3 = 0` exactly). -/
def cornerJson (_ : Unit) : Json :=
  let inHalf : ℕ → Bool := fun s => s % 4 < 2
  let inL : ℕ → Bool := fun s => s == 0 || s == 1 || s == 4
  let region (inA : ℕ → Bool) (sites : Json) : Json :=
    let kls := Array.range 4 |>.map fun j =>
      let k := j + 2
      let pF := countLaw 4 (emitLaw drivenW inA k) k
      let pR := countLaw 4 (emitLaw reversedW inA k) k
      Json.mkObj [("k", toJson k), ("kl", rawFloat (klFloat pF pR))]
    let pF3 := countLaw 4 (emitLaw drivenW inA 3) 3
    let pR3 := countLaw 4 (emitLaw reversedW inA 3) 3
    let tab (p : Array ℚ) : Json :=
      toJson (p.map fun r => s!"{r.num}/{r.den}")
    Json.mkObj [
      ("sites", sites),
      ("kl", toJson kls),
      ("k3driven", tab pF3), ("k3reversed", tab pR3)]
  Json.mkObj [
    ("n", toJson (4 : ℕ)), ("m", toJson (4 : ℕ)), ("Tc", toJson (32 : ℕ)),
    ("half", region inHalf (toJson
      ((List.range 2).flatMap fun x => (List.range 4).map fun y => toJson [x, y]))),
    ("L", region inL (toJson [toJson [0, 0], toJson [1, 0], toJson [0, 1]])),
    ("index", toJson "count sequence c = ∑_t c_t·5^t, c_t = walkers in the region at time t; times 0..k-1")]

/-! ## The 003 profile goldens -/

/-- Every 003 profile field of one run as JSON pairs, from a single
bit-exact pass of the registered profile protocol: the trajectory vector
(`state` one hex pair `x`,`y` per walker — so `n ≤ 16` — plus tallies,
hops and the path edge totals), the per-time column occupancy `cols`, and
the registered window `bounds` with their pooled `sums`. `walkprofilejson`
prints all of them; the contract picks per family. -/
def profileFields (seed : UInt32) (arm : String) (n m t : ℕ) :
    Option (List (String × Json)) := do
  let some ws := armSched arm | none
  let sh := n.log2
  guard (2 ^ sh == n ∧ n ≤ 16)
  let some wins := windowsOf t | none
  let (pos, counts, cols) := profileRun sh ws seed m t
  return [
    ("seed", toJson seed), ("arm", toJson arm),
    ("n", toJson n), ("m", toJson m), ("t", toJson t),
    ("state", toJson (String.ofList (pos.toList.flatMap fun p =>
      [Nat.digitChar p.1.val, Nat.digitChar p.2.val]))),
    ("tallies", toJson (counts.map fun c => (c.1 : Int) - c.2)),
    ("hops", toJson (counts.map fun c => c.1 + c.2)),
    ("nE", toJson (counts.foldl (fun a c => a + c.1) 0)),
    ("nW", toJson (counts.foldl (fun a c => a + c.2) 0)),
    ("cols", toJson cols),
    ("bounds", toJson (wins.map fun b => toJson [b.1, b.2])),
    ("sums", toJson (wins.map fun b => winRow cols b.1 b.2))]

/-- The object of `fields` restricted to `keys`. -/
def pick (fields : List (String × Json)) (keys : List String) : Json :=
  Json.mkObj (fields.filter fun kv => keys.contains kv.1)

/-- The `profile` section of the walk contract: the 003 profile goldens
(trajectories and edge totals, per-time column occupancies, window-pooled
sums, and the rational population circle-W₁ values at the registered
size), exactly the schema the 003 gate and the sweep read. -/
def profileContract (_ : Unit) : Json :=
  let trajGoldens : List (Nat × String × Nat × Nat × Nat) :=
    [(1, "calm", 16, 256, 4), (1, "wind", 16, 256, 4), (1, "max", 16, 256, 4),
     (1, "h8", 16, 256, 4), (2, "windXOR", 16, 256, 4),
     (1, "c2", 16, 256, 2), (1, "w5", 16, 256, 2), (1, "w4", 16, 256, 2),
     (2, "wind", 16, 256, 32), (1, "wind", 4, 1024, 4)]
  let occGoldens : List (Nat × String × Nat × Nat × Nat) :=
    [(1, "calm", 16, 256, 4), (1, "wind", 16, 256, 8), (2, "max", 16, 256, 2),
     (1, "wind", 4, 1024, 4)]
  let winGoldens : List (Nat × String × Nat × Nat × Nat) :=
    [(1, "wind", 16, 256, 32), (2, "calm", 4, 1024, 32)]
  let vec (s : ℕ) (a : String) (n m t : ℕ) : List (String × Json) :=
    (profileFields s.toUInt32 a n m t).get!
  Json.mkObj [
    ("golden", toJson (trajGoldens.map fun (s, a, n, m, t) =>
      pick (vec s a n m t) ["seed", "arm", "n", "m", "t", "state", "tallies", "hops", "nE", "nW"])),
    ("occupancy", toJson (occGoldens.map fun (s, a, n, m, t) =>
      pick (vec s a n m t) ["seed", "arm", "n", "m", "t", "cols"])),
    ("windows", toJson (winGoldens.map fun (s, a, n, m, t) =>
      pick (vec s a n m t) ["seed", "arm", "n", "m", "t", "bounds", "sums"])),
    ("circleW1", toJson ((List.range 3).map fun i =>
      let t := i + 1
      let r := profileW1Q calmW 1024 65536 t
      Json.mkObj [("arm", toJson "calm"), ("t", toJson t),
        ("num", toJson (toString r.num)), ("den", toJson (toString r.den))]))]

/-- The `walk` section of the contract: the arms, the draw recipe, the
trajectory goldens, the exact-DP σ histograms and the K5 corner goldens. -/
def walkContract (_ : Unit) : Json :=
  let goldens : List Json :=
    ((List.range 2).flatMap fun s =>
      ["driven", "reversed", "null"].flatMap fun a =>
        [0, 1, 4].map fun t =>
          (walkGolden (s + 1).toUInt32 a 8 16 t).get!)
    ++ [(walkGolden 1 "driven" 8 16 64).get!,
        (walkGolden 1 "ramp" 8 16 16).get!,
        (walkGolden 1 "ramprev" 8 16 16).get!,
        (walkGolden 1 "driven" 4 4 1).get!,
        (walkGolden 1 "driven" 4 4 32).get!,
        (walkGolden 1 "reversed" 4 4 32).get!]
  Json.mkObj [
    ("lightCone", toJson (1 : ℕ)),
    ("arms", Json.mkObj [
      ("driven", Json.mkObj [
        ("q", toJson ((List.finRange 5).map fun d =>
          toJson (drivenW d))),
        ("a", rawFloat (Float.log (48 / (16 : Float))))]),
      ("reversed", Json.mkObj [
        ("q", toJson ((List.finRange 5).map fun d =>
          toJson (reversedW d))),
        ("a", rawFloat (Float.log (16 / (48 : Float))))]),
      ("null", Json.mkObj [
        ("q", toJson ((List.finRange 5).map fun d =>
          toJson (nullW d))),
        ("a", rawFloat 0)]),
      ("ramp", Json.mkObj [
        ("schedule", toJson ((List.range 16).map fun t =>
          toJson ((List.finRange 5).map fun d =>
            toJson (rampW (t + 1) d))))]),
      ("ramprev", Json.mkObj [
        ("schedule", toJson ((List.range 16).map fun t =>
          toJson ((List.finRange 5).map fun d =>
            toJson (rampRevW (t + 1) d))))])]),
    ("draw", Json.mkObj [
      ("word", toJson "x0 of the Philox block"),
      ("counter", toJson "[walker, step, 0, 0]"),
      ("key", toJson "[seed, 0]"),
      ("init", toJson "x = w % n, y = (w >> log2 n) % n, counter step 0"),
      ("hop", toJson ("counter step t = 1..T; direction = (w >> 24) against " ++
        "the cumulative thresholds [qE, qE+qW, qE+qW+qN, qE+qW+qN+qS]")),
      ("sigma", toJson ("sigma = sum over hops of the E/W tally times " ++
        "ln(qE/qW): (nE - nW)*ln(qE/qW) for constant arms"))]),
    ("golden", toJson goldens),
    ("dp", Json.mkObj [
      ("driven", Json.mkObj [
        ("1", dpExactJson drivenW 16 1), ("2", dpExactJson drivenW 16 2),
        ("4", dpExactJson drivenW 16 4),
        ("64f", dpFloatJson drivenW 16 64)]),
      ("reversed", Json.mkObj [
        ("1", dpExactJson reversedW 16 1), ("2", dpExactJson reversedW 16 2),
        ("4", dpExactJson reversedW 16 4)]),
      ("null", Json.mkObj [
        ("1", dpExactJson nullW 16 1), ("4", dpExactJson nullW 16 4)]),
      ("ramp", dpSchedJson rampW 16 16),
      ("ramprev", dpSchedJson rampRevW 16 16)]),
    ("corner", cornerJson ()),
    ("profile", profileContract ())]

/-- The source text of a theorem's statement, from its name to `:=`. -/
def statement (mod n : Name) : MetaM String := do
  let some r ← findDeclarationRanges? n | throwError "no source range for {n}"
  let path := System.mkFilePath (mod.components.map toString) |>.addExtension "lean"
  let lines := ((← IO.FS.readFile path).splitOn "\n").drop (r.selectionRange.pos.line - 1)
  let text := "\n".intercalate (((lines.head!.drop r.selectionRange.pos.column).toString) :: lines.tail)
  let words := ((text.splitOn ":=").head!.split Char.isWhitespace).toList.map (·.toString)
  return " ".intercalate (words.filter (!·.isEmpty))

/-- Every theorem with a docstring in the `TimesArrow.Claims` module or one
of its children, with the axioms it depends on. -/
def claims : MetaM Json := do
  let env ← getEnv
  let mut out := #[]
  for (n, ci) in env.constants.map₁.toList do
    let .thmInfo _ := ci | continue
    let some idx := env.getModuleIdxFor? n | continue
    let mod := env.header.moduleNames[idx.toNat]!
    unless (`TimesArrow.Claims).isPrefixOf mod do continue
    let some doc ← findDocString? env n | continue
    let axioms := (← collectAxioms n).qsort Name.lt
    let status :=
      if axioms.contains ``sorryAx then "conjecture"
      else if axioms.all allowedAxioms.contains then "proved"
      else "assumes"
    out := out.push (n, Json.mkObj [
      ("name", toJson n), ("statement", toJson (← statement mod n)),
      ("doc", toJson doc.trimAscii.toString),
      ("axioms", toJson axioms), ("status", toJson status)])
  return toJson ((out.qsort fun a b => a.1.lt b.1).map (·.2))

/-- The materialised 001 initial state of a constructor at size `n`, one
word per site: the packed block or the uniform null. -/
def initState (mode : String) (seed : UInt32) : ℕ → Array UInt32
  | 0 => #[]
  | n + 1 =>
    match mode with
    | "packed" => toArray (n + 1) (packedState seed (n + 1))
    | "null" => toArray (n + 1) (nullState seed (n + 1))
    | _ => #[]

def contract : MetaM Json := do
  let stream := Id.run do
    let mut out := #[]
    for seed in [0, 0xDEADBEEF] do
      for step in [0, 1, 0xFFFFFFFF] do
        for site in [0, 1, 2, 3, 0xFFFFFFFF] do
          let b := rand seed step site
          out := out.push <| Json.mkObj [("seed", toJson seed), ("step", toJson step),
            ("site", toJson site), ("out", block b),
            ("u01", toJson ([b.x0, b.x1, b.x2, b.x3].map u01))]
    return out
  let hpp := [(1, 32, 0), (1, 32, 1), (7, 32, 100)].map fun (seed, n, t) =>
    Json.mkObj [("seed", toJson seed), ("n", toJson n), ("t", toJson t),
      ("state", toJson (hexState (run seed n t)))]
  let triples : List (Nat × Nat × Nat) := [(1, 32, 0), (1, 32, 1), (7, 32, 100)]
  let invGold := triples.map fun (seed, n, t) =>
    Json.mkObj [("seed", toJson seed), ("n", toJson n), ("t", toJson t),
      ("state", toJson (hexState (t.repeat (inv n) (run seed.toUInt32 n t))))]
  let echoGold := triples.map fun (seed, n, t) =>
    Json.mkObj [("seed", toJson seed), ("n", toJson n), ("t", toJson t),
      ("state", toJson (hexState (rev n (t.repeat (step n) (rev n (run seed.toUInt32 n t))))))]
  let initGold := [("packed", 1, 32), ("null", 7, 32), ("packed", 1, 64), ("null", 7, 64)].map
    fun (mode, seed, n) =>
      Json.mkObj [("mode", toJson mode), ("seed", toJson seed), ("n", toJson n),
        ("count", toJson (n * n / 8)), ("state", toJson (hexState (initState mode seed n)))]
  return Json.mkObj [
    ("allowedAxioms", toJson allowedAxioms),
    ("claims", ← claims),
    ("philox", Json.mkObj [
      ("M", toJson [M0, M1]), ("W", toJson [W0, W1]), ("rounds", toJson rounds),
      ("kat", toJson (kat.map fun (c, k0, k1, o) => Json.mkObj [
        ("ctr", block c), ("key", toJson [k0, k1]), ("out", block o)])),
      ("stream", toJson stream)]),
    ("hpp", Json.mkObj [
      ("collide", toJson ((List.range 16).map fun s => collide s.toUInt32)),
      ("golden", toJson hpp),
      ("inverse", toJson invGold),
      ("echo", toJson echoGold),
      ("init", toJson initGold)]),
    ("walk", walkContract ())]

def main : List String → IO Unit
  | ["contract"] => do
    initSearchPath (← findSysroot)
    let env ← importModules #[{ module := `TimesArrow }] {}
    let (j, _) ← (contract.run' {} {}).toIO { fileName := "", fileMap := default } { env }
    IO.println (unmarkFloats j.pretty)
  | ["rand", seed, step, site] => do
    let b := rand seed.toNat!.toUInt32 step.toNat!.toUInt32 site.toNat!.toUInt32
    IO.println s!"{b.x0} {b.x1} {b.x2} {b.x3}"
  | ["hpp", seed, n, t] => IO.println (hexState (run seed.toNat!.toUInt32 n.toNat! t.toNat!))
  | ["hppinv", seed, n, t] =>
    IO.println (hexState (t.toNat!.repeat (inv n.toNat!) (run seed.toNat!.toUInt32 n.toNat! t.toNat!)))
  | ["hppecho", seed, n, t] =>
    IO.println (hexState (rev n.toNat!
      (t.toNat!.repeat (step n.toNat!) (rev n.toNat! (run seed.toNat!.toUInt32 n.toNat! t.toNat!)))))
  | ["hppinit", mode, seed, n] =>
    if mode != "packed" && mode != "null" then
      throw (IO.userError "mode must be packed or null")
    else IO.println (hexState (initState mode seed.toNat!.toUInt32 n.toNat!))
  | ["walk", seed, arm, n, m, t] => do
    let ws ← armSchedIO arm
    let nn := n.toNat!
    if 2 ^ nn.log2 != nn then throw (IO.userError "n must be a power of two")
    let pos := positions nn.log2 m.toNat! ws seed.toNat!.toUInt32 t.toNat!
    (List.finRange m.toNat!).forM fun i =>
      let p := pos i
      IO.println s!"{p.1.val} {p.2.val}"
  | ["walktally", seed, arm, m, t] => do
    let ws ← armSchedIO arm
    let M := m.toNat!
    let T := t.toNat!
    Array.range T |>.forM fun s =>
      let tl := stepTally ws seed.toNat!.toUInt32 M (s + 1)
      IO.println s!"{tl.1} {tl.2}"
    let tl := pathTally ws seed.toNat!.toUInt32 M T
    IO.println s!"{tl.1} {tl.2}"
  | ["walkjson", seed, arm, n, m, t] => do
    let some g := walkGolden seed.toNat!.toUInt32 arm n.toNat! m.toNat! t.toNat!
      | throw (IO.userError "invalid walker arm or lattice")
    IO.println (unmarkFloats g.compress)
  | ["walkprofilejson", seed, arm, n, m, t] => do
    let some fields := profileFields seed.toNat!.toUInt32 arm n.toNat! m.toNat! t.toNat!
      | throw (IO.userError "invalid profile arm, lattice (a power of two ≤ 16) or horizon")
    IO.println (Json.mkObj fields).compress
  | _ => throw (IO.userError
      "usage: timesarrow contract | rand SEED STEP SITE | hpp SEED N T | hppinv SEED N T | hppecho SEED N T | hppinit MODE SEED N | walk SEED ARM N M T | walktally SEED ARM M T | walkprofilejson SEED ARM N M T")
