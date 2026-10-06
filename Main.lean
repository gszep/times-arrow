import Lean
import TimesArrow

/-!
`lake exe timesarrow contract` prints the contract JSON. The other commands
evaluate the reference implementation for randomised differential tests:
`rand <seed> <step> <site>` prints four words and `hpp <seed> <n> <t>` prints
the lattice as one hex digit per site.
-/

open Lean TimesArrow Philox LatticeGas

/-- Axioms a proved claim may use. -/
def allowedAxioms : List Name := [``propext, ``Classical.choice, ``Quot.sound]

instance : ToJson UInt32 := ⟨fun x => toJson x.toNat⟩

def block (b : Block) : Json := toJson [b.x0, b.x1, b.x2, b.x3]

def hexState (a : Array UInt32) : String :=
  String.ofList (a.toList.map fun s => Nat.digitChar s.toNat)

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
      ("golden", toJson hpp)])]

def main : List String → IO Unit
  | ["contract"] => do
    initSearchPath (← findSysroot)
    let env ← importModules #[{ module := `TimesArrow }] {}
    let (j, _) ← (contract.run' {} {}).toIO { fileName := "", fileMap := default } { env }
    IO.println j.pretty
  | ["rand", seed, step, site] => do
    let b := rand seed.toNat!.toUInt32 step.toNat!.toUInt32 site.toNat!.toUInt32
    IO.println s!"{b.x0} {b.x1} {b.x2} {b.x3}"
  | ["hpp", seed, n, t] => IO.println (hexState (run seed.toNat!.toUInt32 n.toNat! t.toNat!))
  | _ => throw (IO.userError "usage: timesarrow contract | rand SEED STEP SITE | hpp SEED N T")
