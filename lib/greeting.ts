// Time-of-day greeting for the new-chat empty state. Pure function so it's
// testable and deterministic given a frozen `now`.
//
// Tone aims for warm but not over-familiar — closer to a competent assistant
// than a chatbot mascot. The "night owl" branch is intentionally cheeky for
// users grinding past 22:00 (BTech students preparing for exams, mostly).

export interface Greeting {
  line1: string;
  line2: string;
}

export function buildGreeting(
  name: string | null | undefined,
  now: Date = new Date(),
): Greeting {
  const hour = now.getHours();
  const display = (name && name.trim()) || "there";

  if (hour >= 5 && hour < 12) {
    return {
      line1: `Good morning, ${display}`,
      line2: "What are we tackling today?",
    };
  }
  if (hour >= 12 && hour < 17) {
    return {
      line1: `Good afternoon, ${display}`,
      line2: "How can I help?",
    };
  }
  if (hour >= 17 && hour < 22) {
    return {
      line1: `Good evening, ${display}`,
      line2: "Winding down or just getting started?",
    };
  }
  // 22:00 – 04:59
  return {
    line1: "Hello, night owl",
    line2: `${display}, burning the midnight oil?`,
  };
}
