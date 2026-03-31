I have decided to revisit the fundamental game flow and system for player interaction. The inventory management, crafting and pawn manipulation we have setup I feel would not support our wider aims for the game. We have therefore split off into a new repo and are attempting to return to heavy prototyping of some more core systems.

Attached is a image of the ‘layout' I’m thinking of moving towards. Our timegraph and wheels are our controls, are at the bottom, and are always visible. Our “region” is smaller and on the right. Our hub is on the left and has more zones than previously.

Our overarching first stage goal will be a minimal ‘villager civilization’ that is in some ways full automated. The goal will be to have the hub extract resources in a far simpler way - in order to support its population. The automation/automata behavior will be exposed and driven by the cards placed in the ‘Practice' zone. Eventually these cards will be determined by the ‘Order’ zone, where another system dealing with leadership and aims will dictate the contents of the 'Practice’ zone.

For our big refactor will be to remove/hide references various systems or their parts in order to focus on the new setup. It seems likely that the inventory system, the tag system, the pawn system; will ideally be rendered inert while we build around them. I will need assistance in how we best approach this, as i’m unsure how best to approach this in terms of what is worth keeping and what is worth trying to salvage.

One of the key shifts worth detailing for this first stage is moving from resources interacted through the inventory system towards more global stockpiles held as system pool values on the hub. So instead of food being items tagged edible; we just have food as a number attached to the hub. Also for clean experimentation, I would like to introduce generic non thematic resources like redResource, greenResource, blackResource, blueResource - and just hold them as a system value on the hub.

All our new gamepieces if not a simple static effect will operate with the system pools on automated cadences, sometimes based on satisfying conditions. I will outline some of the kind of intended effects below. They are also visible in the mockup layout.

-

Practices

/”Flood Rites” Beginning of autumn, per free population consumes food and generates one redResource. Commit free population for half a moon/

/“River Recession Farming”  Commit population for a moon. per population consume redResource and greenResource, generate 10 food./

-

Structures

/Granary - Holds 100 food/
/MudHouses  - Holds 20 population/
/RiverTemple - Commit 2 population “Enables Flood Rites”/

-

Tiles

/Floodplains - Every autumn flood, every winter generate deposit 5 greenResource/

-

I think these are all supported by our engine, and seem quite lower in sophistication to what we were already doing, however you will need to advise if this is not the case.

One of the key goals would be to also keep our determinism and defs driven philosophy/architecture. Although we are prototyping, some effort should be made to uphold this.

On establishing the first layout updates, the basic gamepieces, and cleaning up / isolating and hiding unused systems - We can move on to the order system that interacts with the practice gamepieces.

