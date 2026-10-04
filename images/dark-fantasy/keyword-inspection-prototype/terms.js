// Prototype reference copy, recovered from the old workbench's linked glossary
// and rewritten around the current Charge / Cycle / Activation vocabulary.
// Links are discovered by name; no HTML or simulation behavior lives here.
export const terms = {
  Stock: 'Resources held by a Practice in its Stock tray. Each unit carries all of that Practice’s Stock traits. Produce adds units here; Consume spends matching units. Stock capacity limits how many can be held.',
  'Stock traits': 'Traits describe what Stock can satisfy. A unit can carry several traits at once. Bone, Timber, Fuel and Edible are examples. A recipe or Charge trigger looks for matching traits, rather than a particular Practice name.',
  'Stock capacity': 'The maximum Stock held on this Practice. Production stops at capacity. Consume can free space for future Activation effects.',
  Activation: 'The shared rules event for a Practice: its grouped effects resolve together when their requirements are met. Cycle provides a timing; Charge provides an event meter. An Activation can Produce Stock, Gain Research, or have other effects.',
  Cycle: 'A Practice that Activates on its indicated timing, such as a season or Food phase. Each time, its requirements must be met. Its worker multiplier can increase Stock production.',
  Charge: 'Qualifying events advance the Practice’s private meter. When filled and legal, it Activates automatically. Charge is not Stock. Workers increase incoming Charge; they do not multiply its Activation output.',
  Workers: 'Occupied sockets show staffing. The worker multiplier increases Stock production on Cycle Practices, or incoming Charge on Charge Practices. A Scholar worker can also meet specialist requirements.',
  'Worker multiplier': 'The multiplier plate shows effective staffing. It affects Stock production for Cycle Practices and incoming Charge for Charge Practices. Activation requirements still apply.',
  Scholar: 'A specialist worker. Some Practices require a Scholar to Activate. Scholar staffing can also make a Practice count as Knowledge for effects that look for it.',
  Knowledge: 'A classification used by other Practices’ rules. A Practice with this tag, or with a Scholar worker, can count as Knowledge. Read the referring Practice’s Charge trigger for the event it watches.',
  Ancestral: 'A Practice classification associated with inherited traditions. It is separate from Stock traits; the selected Practice’s Activation block explains its actual effects.',
  Research: 'An abstract value gained by the realm. It is separate from the Stock held on a Practice. Gain Research and Produce Stock can be two effects of the same Activation.',
  Produce: 'Add Stock to the Practice’s tray, up to Stock capacity. The Stock carries this Practice’s Stock traits. Production can cause another Practice to Charge when its trigger matches.',
  Consume: 'Spend matching Stock to resolve a recipe. Requirements use local hosts first, then adjacent connected player settlements. Require checks Stock without spending it.',
  Require: 'A condition that must be satisfied for Activation. Required Stock is checked and kept; Consume spends it instead. A full Charge meter can wait until requirements become legal.',
  Bone: 'A Stock trait associated with remains. Anatomical Study can Charge when another local Practice produces Bone Stock. The same Stock may carry other Stock traits too.',
  Timber: 'A Stock trait associated with wood. Timber Stock can satisfy matching Consume or Require inputs and can cause a matching Charge trigger to advance.',
  Fuel: 'A Stock trait used by recipes that need fuel. One unit can have Fuel and other Stock traits, such as Timber. A recipe determines which Stock it needs.',
  Edible: 'A Stock trait that can supply food. The Food phase checks available Edible Stock. Some Cycle Practices Produce it at that timing.',
  'Food phase': 'A named moon phase. A Cycle Practice with this timing checks its requirements and Activates here. The settlement also uses Edible Stock for its meal.',
  Spring: 'One of the four seasons. A Cycle Practice may Activate in Spring; the Activation line gives the outcome for this timing.',
  Summer: 'One of the four seasons. A Cycle Practice may Activate in Summer; the Activation line gives the outcome for this timing.',
  Autumn: 'One of the four seasons. A Cycle Practice may Activate in Autumn; the Activation line gives the outcome for this timing.',
  Winter: 'One of the four seasons. A Cycle Practice may Activate in Winter; the Activation line gives the outcome for this timing.',
  Quality: 'The card’s jewel and frame identify its quality. Higher quality can improve Stock capacity and worker sockets. The enlarged card shows the selected quality’s values.',
};

export const aliases = { Activate:'Activation', Activates:'Activation', Worker:'Workers', 'Scholar worker':'Scholar' };
