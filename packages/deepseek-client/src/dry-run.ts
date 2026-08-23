/**
 * Dry-run dummy response generator for DeepSeekClient.
 *
 * Returns capability-appropriate dummy data so the pipeline can flow
 * end-to-end without calling the real DeepSeek API.
 *
 * The structure matches what the real API would return for each capability.
 * For the story pipeline, the dummy data is identical to Gemini's dry-run
 * so the pipeline behaves the same regardless of which provider is selected.
 */

import type { LlmCallOptions } from "@automation/contracts";

export function generateDummyResponse(options: LlmCallOptions): unknown {
  const cap = options.capability;

  // Story classification
  if (cap === "story.classify") {
    return {
      contentType: "fictional_story",
      reasoning: "Dry-run: classified as fictional_story (dummy response).",
    };
  }

  // Story candidate generation
  if (cap === "story.generate") {
    return {
      candidates: [
        {
          title: "The Quiet Witness (Dry-Run)",
          hook: "She noticed what everyone else missed.",
          premise: "A quiet observer discovers a hidden truth about her small town.",
          storyline: "In a sleepy coastal town, a young woman working at the local diner notices patterns others overlook. When a stranger arrives asking questions about a decades-old disappearance, she realizes her observations might hold the key to solving the mystery. As she pieces together fragments of memory and overheard conversations, she uncovers a connection that changes everything she thought she knew about her community.",
          contentType: "fictional_story",
          emotionalArc: "Curiosity → Suspicion → Revelation → Bittersweet understanding",
          corePsychologicalIdea: "The bystander effect and how observation without action shapes identity",
          mainCharacterRole: "Observer / Protagonist",
          keyEvents: [
            "Notices the stranger asking questions at the diner",
            "Overhears a conversation about the old disappearance",
            "Finds a faded photograph in the town archive",
            "Confronts a longtime resident with her discovery",
          ],
          twistOrResolution: "The disappearance was voluntary — the person left to protect someone they loved",
          lessonOrTakeaway: "Sometimes the most important thing we can do is simply pay attention",
          fingerprint: "A quiet observer in a small town uncovers a decades-old secret about a disappearance",
          sourceReferences: [],
        },
        {
          title: "The Weight of Silence (Dry-Run)",
          hook: "He hadn't spoken in three years. Then he said one word.",
          premise: "A selectively mute child breaks his silence at a critical moment.",
          storyline: "After a traumatic event, a young boy stops speaking entirely. His parents try everything — therapists, specialists, new schools. Then one day during a crisis, he utters a single word that changes the trajectory of his family's life and reveals what he's been carrying all along.",
          contentType: "fictional_story",
          emotionalArc: "Concern → Frustration → Breakthrough → Healing",
          corePsychologicalIdea: "Selective mutism as a trauma response and the power of timing in communication",
          mainCharacterRole: "Child / Protagonist",
          keyEvents: [
            "Stops speaking after the traumatic event",
            "Parents try increasingly desperate interventions",
            "A crisis occurs at home",
            "He speaks one word that reframes everything",
          ],
          twistOrResolution: "The word he finally says is the name of someone he lost — acknowledging the grief he couldn't express",
          lessonOrTakeaway: "Healing happens on its own timeline, not ours",
          fingerprint: "A mute child breaks silence during a crisis, revealing unprocessed grief",
          sourceReferences: [],
        },
        {
          title: "The Map She Never Finished (Dry-Run)",
          hook: "Her grandmother left her a map with one missing piece.",
          premise: "A woman inherits an incomplete hand-drawn map and must retrace her grandmother's steps.",
          storyline: "When her grandmother passes, a woman discovers a hand-drawn map among the belongings — but the final destination is missing. Following the clues through places her grandmother visited decades ago, she uncovers a story of love, sacrifice, and a choice that defined her family's future.",
          contentType: "fictional_story",
          emotionalArc: "Grief → Curiosity → Discovery → Acceptance",
          corePsychologicalIdea: "How unfinished business passes between generations",
          mainCharacterRole: "Granddaughter / Protagonist",
          keyEvents: [
            "Finds the incomplete map in grandmother's belongings",
            "Visits the first marked location",
            "Meets someone who knew her grandmother",
            "Discovers the missing destination and its meaning",
          ],
          twistOrResolution: "The map led to a place her grandmother chose not to return to — a sacrifice for her family",
          lessonOrTakeaway: "Some choices are acts of love we only understand in hindsight",
          fingerprint: "A woman follows an incomplete map left by her grandmother, discovering a sacrifice",
          sourceReferences: [],
        },
      ],
    };
  }

  // Story DNA extraction
  if (cap === "story.dna") {
    return {
      protagonistArchetype: "The Quiet Observer",
      protagonistGoal: "To understand what others overlook",
      incitingIncident: "A stranger arrives asking questions about a decades-old disappearance",
      centralConflict: "The tension between noticing and acting",
      mainObstacle: "The town's collective silence and her own hesitation",
      reversalOrTwist: "The disappearance was voluntary",
      resolution: "She learns that observation itself is a form of care",
      psychologicalMechanism: "The bystander effect and passive engagement",
      lesson: "Sometimes the most important thing we can do is simply pay attention",
      setting: "A sleepy coastal town",
    };
  }

  // Duplicate adjudication
  if (cap === "story.adjudicate") {
    return {
      sharedPremise: "Both stories involve a quiet observer uncovering a secret",
      sharedEventSequence: "Both follow a pattern of noticing, investigating, and revealing",
      sharedTwist: "Both have a recontextualization of the past",
      meaningfulDifferences: "Different setting, different secret, different character motivations",
      finalClassification: "original",
    };
  }

  // Scene planning
  if (cap === "image.scene_plan") {
    return {
      scenes: [
        {
          order: 1,
          storyPurpose: "Establish the protagonist and setting",
          narrationText: "In a sleepy coastal town, a young woman working at the local diner notices patterns others overlook.",
          visualEvent: "Wide shot of the coastal town, then the diner interior with the protagonist working",
          characterRole: "protagonist",
          poseAndExpression: "Looking out the diner window, observant and contemplative",
          environment: "Small coastal town diner, morning light",
          cameraFraming: "Medium wide, establishing shot",
          lightingAndMood: "Soft morning light, calm and slightly melancholic",
          expectedDurationSeconds: 7,
          imageRequirement: "character_scene",
          sourceClaimIds: [],
          characters: [
            { name: "Emily", roleInScene: "protagonist", poseAndExpression: "Looking out the diner window, observant and contemplative" },
          ],
        },
        {
          order: 2,
          storyPurpose: "Introduce the inciting incident",
          narrationText: "When a stranger arrives asking questions about a decades-old disappearance, she realizes her observations might hold the key.",
          visualEvent: "A stranger enters the diner and asks the protagonist questions",
          characterRole: "protagonist",
          poseAndExpression: "Surprised, leaning in with curiosity",
          environment: "Diner interior, afternoon",
          cameraFraming: "Medium close-up",
          lightingAndMood: "Warm afternoon light, tension building",
          expectedDurationSeconds: 8,
          imageRequirement: "character_scene",
          sourceClaimIds: [],
          characters: [
            { name: "Emily", roleInScene: "protagonist", poseAndExpression: "Surprised, leaning in with curiosity" },
            { name: "George", roleInScene: "supporting", poseAndExpression: "Serious, asking questions with quiet intensity" },
          ],
        },
        {
          order: 3,
          storyPurpose: "Rising action — investigation",
          narrationText: "As she pieces together fragments of memory and overheard conversations, she uncovers a connection.",
          visualEvent: "The protagonist looks through old photographs and records",
          characterRole: "protagonist",
          poseAndExpression: "Focused, determined, slightly overwhelmed",
          environment: "Town archive room, dusty shelves",
          cameraFraming: "Close-up on hands and face",
          lightingAndMood: "Dim, warm lamp light, mystery atmosphere",
          expectedDurationSeconds: 7,
          imageRequirement: "character_scene",
          sourceClaimIds: [],
          characters: [
            { name: "Emily", roleInScene: "protagonist", poseAndExpression: "Focused, determined, slightly overwhelmed" },
          ],
        },
        {
          order: 4,
          storyPurpose: "Environmental beat — the town",
          narrationText: "The town had its own rhythms, its own silences. Some things people just didn't talk about.",
          visualEvent: "Wide shot of the coastal town at dusk",
          characterRole: "none",
          poseAndExpression: "N/A",
          environment: "Coastal town, dusk",
          cameraFraming: "Wide establishing shot",
          lightingAndMood: "Dusk, cool tones, contemplative",
          expectedDurationSeconds: 5,
          imageRequirement: "non_character_scene",
          sourceClaimIds: [],
          characters: [],
        },
        {
          order: 5,
          storyPurpose: "Climax — confrontation",
          narrationText: "She confronts a longtime resident with her discovery, and the truth changes everything.",
          visualEvent: "The protagonist talks with an elderly resident on a porch",
          characterRole: "protagonist",
          poseAndExpression: "Earnest, emotional, seeking answers",
          environment: "Resident's porch, late afternoon",
          cameraFraming: "Two-shot, medium",
          lightingAndMood: "Golden hour, emotional weight",
          expectedDurationSeconds: 8,
          imageRequirement: "character_scene",
          sourceClaimIds: [],
          characters: [
            { name: "Emily", roleInScene: "protagonist", poseAndExpression: "Earnest, emotional, seeking answers" },
            { name: "Noah", roleInScene: "supporting", poseAndExpression: "Reluctant, defensive but ultimately cooperative" },
          ],
        },
        {
          order: 6,
          storyPurpose: "Resolution — reflection",
          narrationText: "Sometimes the most important thing we can do is simply pay attention. Not act. Not solve. Just notice.",
          visualEvent: "The protagonist back at the diner, looking out the window thoughtfully",
          characterRole: "protagonist",
          poseAndExpression: "Looking out window, contemplative, at peace",
          environment: "Diner, late afternoon light",
          cameraFraming: "Wide shot, protagonist framed by the window",
          lightingAndMood: "Warm golden hour, reflective and bittersweet",
          expectedDurationSeconds: 8,
          imageRequirement: "character_scene",
          sourceClaimIds: [],
          characters: [
            { name: "Emily", roleInScene: "protagonist", poseAndExpression: "Looking out window, contemplative, at peace" },
          ],
        },
      ],
    };
  }

  // Research structuring
  if (cap === "research.structure") {
    return {
      sources: [
        { id: "s1", title: "Dry-Run Source", url: "https://example.com/dry-run", excerpt: "Dry-run excerpt." },
      ],
      claims: [
        { id: "c1", claim: "Dry-run claim.", sourceIds: ["s1"], confidence: "medium" },
      ],
      uncertainties: ["Dry-run uncertainty"],
      allowedFacts: ["Dry-run allowed fact"],
      warnings: ["Dry-run warning — manual review needed"],
    };
  }

  // Default
  return {
    dryRun: true,
    capability: cap,
    message: "Dry-run dummy response — no real DeepSeek API call was made.",
    model: options.model,
  };
}
