# Offline static provenance r2: documented native-image age binding

Fresh offline revision; r1 sources,14-control receipt, initial UNAVAILABLE and
one downloaded1921024-byte PDB remain frozen. PDB SHA
26d65ee88992ad9c3b258142f7dd3aac3b56f9e271587d9043d01dab3552163c.
This revision performs zero network requests and no native API/DLL/helper/target/
debugger/compiler/browser/benchmark work. Simulation/RNG/schema/replay untouched.

R1 required PDB info age equal to image age and then DBI age equal to info age.
It rejected infoAge4/imageAge1 before examining DBI. Microsoft publishes its
native-image PDB validation in PDB1::OpenValidate4: GUID must match, PDB info age
must be at least the image age, and nonzero DBI age must equal the image age.
[Microsoft source](https://github.com/microsoft/microsoft-pdb/blob/master/PDB/dbi/pdb.cpp).
R2 uses GUID equality, infoAge>=imageAge>0 and exact DBIAge==imageAge. Legacy
DBI0 is deliberately unsupported; it remains unavailable. General metadata
descriptions that expect identical stream ages do not cover this image-binding
distinction; the changed predicate is explicit and needs independent assessment.

All14 original fixture names and mutations are retained. One expectation changes
openly: r1 "wrong PDB age" sets info2/image1/DBI1, which the published validator
accepts. Four predeclared affected controls add info4/image1/DBI1 success, info
older than image rejection, DBI0 rejection and later-info/wrong-DBI rejection.
All18 Builder cases passed before inspecting real PDB data with this revision.
The r1 rejection is never rewritten or described as successful evidence.

All earlier byte/stream/record/runtime-function caps and raw GUID checks remain.
inspect.mjs authenticates the complete r1 frozen acquisition and original r3
input identities, freezes this source/controls chain, then resolves only those
existing bytes. Source/result pins and all unavailable evidence are retained.

This is Builder static identity/public-symbol/runtime-function/byte evidence.
Names are discovered, not presumed. Symbol containment and INT3 byte do not
establish instruction boundaries, startup role or a safe continuation policy.
No observed-RVA hardcode, broad first-ntdll-breakpoint predicate, actual native
retry or replacement follows. The separate owned-duplicate/typed bounded
postEXIT wait repair and independent affected complete-source admission remain.
Whole Phase A NOT SOUND; no preview, performance gain, scoring, merge or Pages.
