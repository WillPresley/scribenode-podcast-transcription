export const SAMPLE_INTERVIEW_TRANSCRIPT = `# The Future of Generative Audio Architecture
**Hosts:** *Sarah Drabner, Alex Rivera*

---

[00:00] **Alex Rivera**: Welcome to the Architecture Daily podcast. Today we are exploring modern AI pipelines with Sarah Drabner.

[00:15] **Sarah Drabner**: Thanks for having me Alex. It's exciting because multi-stage workflows allow us to combine ultra-fast speech alignment with deep contextual summarization.

[00:45] **Alex Rivera**: How do teams manage latency during peak usage?

[01:10] **Sarah Drabner**: We employ exponential backoff with model fallbacks across Gemini 3.6 Flash and Gemini 3.5 Flash.`;

export const SAMPLE_SOLO_TRANSCRIPT = `# Mastering Deep Work in Software Engineering
**Hosts:** *David Calaway*

---

[00:00] In today's episode, we discuss time blocking and cognitive load reduction for engineering teams.

[01:30] The single greatest productivity drain is fragmented context switching between messaging apps and code reviews.

[03:45] By establishing unbroken ninety-minute deep work blocks, developer velocity increases exponentially.`;

export const SAMPLE_MESSY_TRANSCRIPT = `[00:01] SPEAKER A: Um, so you know, we were basically testing the, uh, new transcriber yesterday.
[00:22] SPEAKER B: Like, and and it was really fast, right? We got the output in like three seconds.
[00:45] SPEAKER A: Exactly. No disfluencies and clean timestamps.`;

export const SAMPLE_ANALYSIS_FIXTURE = {
  summary: "### Executive Summary\nExplores generative audio pipeline architectures and latency optimization.",
  key_takeaways: "1. Multi-stage workflows decouple speech alignment from heavy reasoning.\n2. Fallback models ensure high uptime.",
  chapters: "- **[00:00] Introduction to Audio Pipelines**\n- **[01:10] Latency & Fallback Strategy**",
  social_media: "🎙️ Just listened to a great breakdown of AI audio architecture with @sarahdrabner!"
};
