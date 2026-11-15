# Draft lifecycle support, not a runnable observer

Fresh artifact source only. No control/preview process or Native method has been
run by this draft. Compile-only entry builds a library and inspects metadata;
it must not instantiate OwnedJob/BoundedPipe. Source is not admitted for targets.

Frozen dependencies: original NativeCaptureAbi.cs and the separately reviewed
NativeCaptureSupport.cs. Do not overwrite their proof or dispatch any old ID.

| Resource | Draft owner | Intended terminal proof |
| --- | --- | --- |
| Unnamed no-breakaway job | OwnedJob safe handle | Terminate, service pending debug events, query active0 while handle valid, then close; closure alone is not proof |
| Suspended target creation handles | Not implemented | Controller must retain, verify actual identity, assign job before resume and prove exit |
| Pipe read end | SafeFileHandle/FileStream on dedicated reader | EOF plus bounded reader join; cancellation/error stays incomplete |
| Pipe write end | Observer OwnedHandle then explicit child allowlist | Controller must close observer copy immediately after creation |
| Reader OS-thread handle | Duplicate of that reader's own thread | Retain for bounded cancellation; dispose only after reader stops |
| Debug-event handles | Not implemented | Loop must distinguish OS-closed process/thread handles from owned image/DLL handles |
| Startup attribute buffers | Not implemented | Controller must maintain exact three-handle inheritance and bounded disposal |

Remaining before source/child admission: immutable manifest-to-creation binding,
creation-time image/PID/FILETIME evidence, initialization rollback, STARTUPINFOEX
handle list, primary resume gate, same-OS-thread finite debug loop, exact loader
breakpoint decision, lossless bounded event/receipt schema, exclusive runner,
cleanup callback implementation and whole-session classifier. The callback must
remain finite and service exit events; its current delegate contract alone does
not prove either. Reader cancellation/join and failure disposal need actual
synthetic controls. A constructor or cleanup method signature is not lifecycle
evidence.

The support Wire.Lossless method is only reviewed for bounded Abi.Decode graphs
of known dictionaries/lists/UInt64 fields. Do not feed arbitrary lifecycle
objects, IntPtr or Int64 into it or assume a generic cycle/size-bounded serializer.
Project all new native handles/times and counts through an explicit bounded
receipt schema first. No overflow or loss of available raw bytes may be hidden.

Future six synthetic controls remain unexecuted and require frozen source/binary/
compiler/config identities plus independent affected source admission. Real
preview prefix remains separately blocked on trial-wide daemon lifetime design.
No API/capture/neutrality/product-performance/SOUND claim follows from this draft.
