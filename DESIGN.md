# Dot Codex Siamese Cat Visual Spec

## Purpose
This document defines the visual language for the Dot Codex device experience: a monochrome pixel-art Siamese cat whose posture, expression, props, and motion communicate Codex state.

The goal is not generic cute animation. The goal is instant state recognition on a 296x152 E Ink screen.

## Product Principles
1. State first, decoration second.
2. Readability beats detail.
3. Siamese identity must come from silhouette, not color.
4. Motion should feel alive but restrained.
5. Every frame must still work as a static image.

## Screen Constraints
- Canvas: 296x152 px
- Output: monochrome, high contrast
- Target style: 1-bit pixel art with clean outlines
- Safe area: 16 px left/right, 12 px top/bottom
- Main subject width: 84-112 px
- Main subject height: 72-96 px
- Caption area: optional, bottom 24 px max

## Character Bible
### Base character
- Species cue: Siamese cat
- Build: slim body, long neck, narrow face, oversized triangular ears, thin tail
- Face: dark mask implied through shape blocks, not grayscale
- Eyes: almond-shaped, slightly intense, alert
- Pose language: elegant, intelligent, curious, slightly dramatic

### What makes it read as Siamese on a monochrome screen
- Large angular ears
- Narrow muzzle and long face
- Slender torso instead of round kitten body
- Tail is long and whip-like, not fluffy
- Eye shape is sharp, not dot-eyes
- Facial mask is shown as a strong outline patch around eyes and nose bridge

### Emotional tone
- Smart
- Slightly opinionated
- Sensitive to interruption
- Busy but graceful

## Pixel Style Rules
### Line work
- Outer contour: 2 px equivalent visual weight
- Inner details: 1 px
- Avoid anti-aliased soft shading
- Use hatch blocks sparingly for depth

### Fill strategy
- Prefer solid black islands over noisy dithering
- Use white negative space to separate limbs and props
- Reserve dense texture for accessories, not the whole body

### Motion strategy
- Each state uses 3 enter frames + 1 hold frame
- Motion comes from one main moving part only:
  - ears
  - tail
  - paw
  - eyes
  - prop
- Avoid full-body redraw in every frame
- E Ink rhythm should feel like flipbook punctuation, not fluid 24 fps animation

## Composition System
### Layout
- Character occupies left-center or center
- Prop sits on the side opposite the action direction
- State iconography must be readable from 1 meter away

### Background
- No scenic backgrounds
- Only one environmental hint per state:
  - floor line
  - terminal window
  - bowl
  - box
  - cursor panel
- Background should never compete with the cat

### Text
- Default: no text on device art
- If text is added later, keep to 1 short label or 1 tiny counter

## State Mapping
## 1. Starting
### Narrative
The Siamese cat just woke up because it sensed work beginning.

### Scene
- Cat sits upright on a small cushion or terminal box
- Ears rise from half-fold to fully alert
- Tail curls into a question-mark shape
- Tiny boot spark or cursor appears beside it

### Expression
- Eyes opening from sleepy slit to focused stare
- Mouth neutral

### Props
- Tiny square terminal window or blinking cursor cube

### Motion
- Frame 1: head lowered, ears relaxed
- Frame 2: one ear lifts, tail uncurls
- Frame 3: both ears fully up, cursor lights
- Hold: poised and attentive

### Meaning
"Session is booting and attention has shifted to work."

## 2. Running
### Narrative
The Siamese cat is actively working, inspecting, pawing, and thinking.

### Scene
- Cat leans over a tiny terminal slab or keyboard pad
- One paw is on the work surface
- Tail swings behind in a controlled S-curve

### Expression
- Focused eyes
- Slight brow angle
- Tiny mouth line, no smile

### Props
- Pixel terminal panel
- 2-3 small code blocks or scrolling lines

### Motion
- Frame 1: paw down, eyes fixed
- Frame 2: paw taps, tail shifts
- Frame 3: terminal lines change, whiskers forward
- Hold: concentrated working pose

### Meaning
"Agent is actively reading, thinking, or executing."

## 3. Waiting Input
### Narrative
The Siamese cat has paused and is looking back at the human, expecting confirmation.

### Scene
- Cat turns body three-quarters toward viewer
- One paw is raised mid-air
- A dialogue card, checkbox, or confirm button hovers near the paw

### Expression
- Wide eyes
- Slight head tilt
- Ears forward

### Props
- Confirmation card
- Small prompt bubble with one large cursor block

### Motion
- Frame 1: cat turns toward viewer
- Frame 2: paw lifts and card appears
- Frame 3: blink or ear twitch while waiting
- Hold: frozen question pose

### Meaning
"I need you now. Action is blocked until you answer."

## 4. Completed
### Narrative
The Siamese cat finishes the task and settles with quiet pride.

### Scene
- Cat sits neatly with tail wrapped around paws
- Beside it is a completed paper, checkmark tablet, or tiny finished sketch
- Body posture becomes symmetrical and calm

### Expression
- Eyes soft but confident
- Subtle closed-mouth satisfaction

### Props
- Checkmark tile
- Finished page or tiny framed output

### Motion
- Frame 1: cat straightens from work pose
- Frame 2: prop locks into completed state
- Frame 3: tail wraps around paws
- Hold: elegant resting victory pose

### Meaning
"Task finished successfully."

## 5. Failed
### Narrative
The Siamese cat hit a problem and is visibly annoyed, not devastated.

### Scene
- Cat recoils slightly from a terminal slab
- Tail flicks sharply
- One small error spark or X marker appears

### Expression
- Narrowed eyes
- Ears angled back
- Mildly displeased face

### Props
- Error tile with X
- Tiny broken command line

### Motion
- Frame 1: cat notices issue
- Frame 2: tail snaps and error icon appears
- Frame 3: cat stiffens into alert frustration
- Hold: guarded, irritated pose

### Meaning
"Task stopped with an error or bad outcome."

## 6. Cancelled
### Narrative
The Siamese cat stops mid-task and walks away with deliberate indifference.

### Scene
- Cat has turned sideways, half-exiting frame
- Work surface remains behind it

### Expression
- Looking away, not at viewer

### Props
- Faded terminal block left behind

### Motion
- Frame 1: pause
- Frame 2: body rotates away
- Frame 3: tail exits last
- Hold: partially off-screen

### Meaning
"Task was intentionally stopped."

## State Recognition Heuristics
A user should identify the state without reading text by these cues:
- Starting: ears waking up
- Running: paw on terminal
- Waiting Input: raised paw toward viewer
- Completed: seated symmetry + wrapped tail
- Failed: ears back + error spark
- Cancelled: body leaving frame

## Prop Language
Use props consistently.
- Terminal slab: running/starting only
- Confirm card: waiting_input only
- Check tile: completed only
- Error X/spark: failed only
- Abandoned terminal: cancelled only

Do not reuse the same prop across conflicting states.

## Animation Timing
### Default timing
- Enter frame interval: 250-350 ms
- Hold frame: persistent

### E Ink guidance
- Avoid visual chatter in hold state
- Enter motion should read in under 1.5 seconds total
- If the screen ghosting is noticeable, reduce black pixel changes between adjacent frames

## Monochrome Treatment
Because Dot is monochrome, Siamese color points must be translated into shape cues.

Use black regions to imply:
- face mask
- ear tips
- paws
- tail tip

Do not rely on:
- gray fur separation
- subtle shading
- soft gradients

## What to Avoid
- Chibi round cat proportions
- Generic kawaii dot-eyes
- Busy room backgrounds
- Full-screen dither texture
- Human-like cartoon gestures
- Overly bouncy motion
- Props that make the state ambiguous

## Recommended Art Direction
### Visual keywords
- Siamese
- pixel noir
- elegant hacker pet
- quiet intelligence
- restrained humor

### Not the vibe
- sticker pack
- children's cartoon
- meme cat
- hyper-detailed realism

## Production Spec For Asset Generation
For each state, produce:
- `enter-01.png`
- `enter-02.png`
- `enter-03.png`
- `hold.png`

Art checklist per frame:
- subject centered and readable
- silhouette distinct at thumbnail size
- no more than one primary action
- props isolated from body outline
- hold frame strongest and clearest

## Runtime Policy For Auto Trigger
### Recommended trigger model
Use a shell-level `codex` wrapper so every normal `codex` invocation automatically runs through Dot Codex.

### Recommended zsh approach
- Replace the interactive `codex` command with a function or shim
- Forward all original args unchanged
- Default behavior should feel invisible to the user

## Multi-Process Policy
If multiple Codex processes share the same Dot device and same `taskKey`, they must be scheduled deliberately. Otherwise, the device will flicker unpredictably and the displayed state will not correspond to a single understandable session.

### Recommended policy
Default to `round-robin-active`.

Definition:
- every active wrapper session is tracked in a shared session registry
- the Dot display rotates across active sessions on a fixed cadence
- each displayed card must include a short visible session id
- `waiting_input` sessions get priority over `running`
- terminal states are shown briefly, then aged out

### Why this is the right default
- the user explicitly wants awareness of more than one Codex session
- a single screen can still represent many sessions if each card is clearly labeled
- session id on screen prevents ambiguity about which process currently owns the card

### Priority order
- `waiting_input`
- `failed`
- `running`
- `starting`
- `completed`
- `cancelled`

### Rotation rules
- only one session is displayed at a time
- each session gets a display slice, then control moves to the next eligible session
- default slice:
  - `waiting_input`: 8 seconds
  - `failed`: 6 seconds
  - `running`: 5 seconds
  - `starting`: 4 seconds
  - `completed`: 4 seconds
  - `cancelled`: 4 seconds
- if any session enters `waiting_input`, it should jump to the front of the queue on the next rotation boundary

### Session ID treatment
- render a short id on screen, for example `A1`, `B3`, or the last 4 chars of a generated session id
- place it in a small bottom-right badge
- the badge must not dominate the cat art
- badge style must be identical in all states

### Aging rules
- `completed` and `cancelled` stay in the rotation queue for a short TTL, then disappear
- recommended TTL:
  - `completed`: 45 seconds
  - `cancelled`: 20 seconds
- `failed` should remain until the session exits or the TTL expires

### Future optional modes
- `exclusive-first`: first session keeps the screen until exit
- `exclusive-latest`: newest session steals the screen
- `summary-mode`: show aggregated counts like `2 running / 1 waiting`

For V1, ship `round-robin-active` only.

## Session Scheduling Rules
If we implement `round-robin-active`, runtime should behave like this:
- wrapper start writes or updates a shared session registry file
- registry contains session id, pid, cwd, current state, last update time, and last shown time
- each active session refreshes heartbeat every few seconds
- a local scheduler chooses the next session to display based on priority and least-recently-shown order
- only the scheduler pushes to the device
- worker sessions publish state changes to the registry, but do not push directly unless they are currently selected
- if a session heartbeat expires, it is removed from the rotation
- if a session enters `waiting_input`, it is promoted in priority but still shows its session id

## Recommended Next Implementation Order
1. Produce final art from this spec
2. Add `round-robin-active` scheduler to runtime
3. Add zsh wrapper/shim so `codex` auto-triggers Dot Codex

## Acceptance Criteria
The final art is correct if:
- each state is recognizable in under 1 second
- Siamese identity reads without color
- waiting_input feels distinctly human-facing
- completed feels calm, not celebratory chaos
- failed feels frustrated, not tragic
- running feels intelligent and active
