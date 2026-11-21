---
translationLanguage: en
sourceHash: "171b89b2e2313d1c68e2c8259aa59e37f7c7d4513823966233a4e466b16547fa"
title: "Reflections on Claude Plays Robotics"
description: "My thoughts after reading Claude Plays Robotics."
tags: []
coverAlt: "Cover image for reflections on Claude Plays Robotics"
---

# Claude Plays Robotics: When LLMs Start Controlling Robots

I recently read Anthropic’s [Claude Plays Robotics](https://www.anthropic.com/research/claude-plays-robotics). The work asks a fascinating question:

**How far can a general-purpose language model, without specialized robotics training, go in controlling a real physical system?**

When discussing robot intelligence, we often look at VLA task success rates on benchmarks such as LIBERO and RoboTwin. Anthropic takes a different approach: instead of training a new robotics foundation model, it lets general-purpose models such as Claude, GPT and Gemini interact with robots through different control interfaces.

The resulting lesson is more interesting than a simple model leaderboard:

**An LLM’s robotics capabilities depend not only on the model itself, but also strongly on the tools it can call, the control authority it has, and whether it can use execution feedback to correct its behavior.**

## 01. Embody: How Do We Evaluate an LLM’s Robotics Capabilities?

Anthropic built a benchmark called Embody, covering three types of tasks:

- **Classic Control**: an inverted pendulum, Hopper and the newly designed TwinFlipper, primarily testing understanding of dynamics and low-dimensional control.
- **Locomotion**: standing, balancing, walking and navigation with the Unitree Go2 quadruped and G1 humanoid.
- **Manipulation**: touching, grasping and placing objects with a Franka Panda arm in LIBERO and additional scenes.

Most experiments run in MuJoCo simulation. The paper also includes a small number of exploratory experiments with a physical Go2 robot.

What interests me more than the tasks themselves, however, is the four different control interfaces provided to the same models.

| Interface | What the LLM does |
| --- | --- |
| Direct Control | Directly outputs torques, forces or end-effector motion commands |
| Programmatic Control | Writes a Python controller that maps states to actions |
| Policy Control | Calls and supervises existing robot policies |
| RL Supervision | Designs rewards, networks and training plans, then trains a policy through PPO |

These correspond to four different ways of building robot intelligence.

Direct Control requires the LLM to solve low-level control problems itself. Policy Control delegates low-level execution to an already trained policy.

In other words, **the researchers are changing not just the model, but the interface between the model and the physical world.**

In the paper’s aggregate scores, Mythos Preview reaches 0.389, Opus 4.6 reaches 0.351 and GPT-5.4 scores 0.251. These are normalized aggregate metrics across tasks; they do not mean that the robots have task success rates of 38.9%, 35.1% and 25.1%, respectively.

Model rankings also differ across control interfaces.

This makes me think that evaluating so-called embodied intelligence with a single aggregate score can conceal important differences between capabilities.

## 02. LLMs Struggle with Direct Control, but Excel at Writing Controllers

In classic control tasks, Anthropic observes that:

**Asking an LLM to write a Python controller is usually more effective than asking it to output low-level actions step by step.**

The reason is not hard to understand.

Suppose a robot needs to balance an inverted pendulum. Direct Control requires the LLM to produce a new control action after each observation, while stability depends on continuous, timely feedback.

With Programmatic Control, the LLM can instead write a feedback controller:

`observation → controller(obs) → action`

That controller can then run continuously in the simulation loop, without calling the LLM again at every step.

This changes the LLM’s role from a real-time controller to a designer of controllers.

The paper also finds that newer models’ advantage in classic control does not come entirely from better first attempts.

Often, the first controller a model writes still performs poorly. The real improvement comes from observing failures, modifying the control logic and performing better in later attempts.

This reminds me of an important agent capability:

**What matters is not simply how good the first generated policy is, but whether the agent can keep correcting errors through environmental feedback.**

For now, however, this improvement mainly occurs within short-term interactions. It should not be equated directly with long-term skill learning.

## 03. Asking LLMs to Train PPO Automatically Works Less Well Than Expected

Anthropic also conducts an interesting experiment: asking LLMs to train reinforcement learning policies from scratch.

Models can design reward functions, policy networks and training plans, then call PPO training tools.

The experiments use GPU-parallel MuJoCo environments, with up to 32 parallel environments by default. The per-experiment budget is 1.5 hours for classic control and 4 hours for Go2 and G1.

From an agent perspective, this is already an automated RL workflow:

**Design an experiment → train a policy → obtain evaluation results → adjust the training plan → deploy the policy.**

The results, however, are somewhat counterintuitive.

In classic control, the RL policies trained by almost all models are weaker than the Python controllers those models write directly.

One exception is TwinFlipper. In this newly designed pinball control task, GPT-5.4 is the only model that consistently trains competitive policies.

I do not think we can conclude simply that “LLMs are unsuitable for RL.”

Writing a controller directly and training PPO involve different problems.

The former can use a model’s existing physics and programming knowledge to construct a feedback control law directly. The latter requires designing a suitable reward, choosing a policy network, managing training, and finding an effective policy within a limited sampling budget.

An LLM’s ability to automate RL is therefore constrained by reward design, experiment planning and sample efficiency at the same time.

This also reminds me that research on agents automatically generating robot policies should do more than show the final successful runs. It should compare the approach with fixed training configurations, human-designed reward functions and equal-budget hyperparameter search.

Otherwise, it is difficult to establish whether the gain comes from the agent’s reasoning or simply from running more trials.

## 04. The Most Interesting Part: LLM + VLA Is Not Necessarily Better Than VLA Alone

This is the experiment that interested me most while reading the article.

Anthropic introduces a pretrained VLA, MolmoAct, into LIBERO scenes.

The VLA proposes actions based on robot observations and task instructions. An LLM supervises those actions, deciding whether to accept, modify or replace them.

The process can be understood as:

**Observation → VLA Proposed Action → LLM Supervisor → Robot Execution → Feedback**

At first glance, this seems like a reasonable architecture.

VLAs are good at low-level manipulation; LLMs are good at task understanding, reasoning and planning. In theory, combining the two should outperform running a VLA alone.

The experimental results do not fully support that intuition.

On the standard LIBERO-40 tasks, every evaluated LLM supervisor reduces MolmoAct’s original performance.

This suggests that, although many LLMs understand a task, they cannot necessarily judge correctly when a VLA needs help.

More interestingly, Mythos Preview, the strongest model overall, performs worse in this experiment than Opus 4.5 and Opus 4.6.

It puts too much trust in its own judgment, frequently changing VLA actions that were already correct.

**A supervisor with stronger reasoning is not necessarily a more reliable supervisor.**

The picture changes on three novel tasks that MolmoAct cannot complete independently.

Some newer models begin to recognize incorrect VLA proposals and bring additional gains through intervention. Mythos Preview also completes some of these novel tasks.

There is a clear tension here:

When the VLA is already reliable, LLM intervention can cause additional losses. When the VLA faces out-of-distribution tasks, the LLM may compensate for its limitations.

This brings me to a research question that seems more worthwhile:

**When should we trust the base policy, and when should we intervene?**

Compared with giving an LLM unconditional authority over a VLA, I think selective intervention may be a more valuable direction.

An ideal supervisor should do more than spot errors. It should know whether its correction is actually better than the original policy’s action.

## 05. The Bottleneck May Be More Than Visual Understanding

Another experiment that surprised me was the ablation of visual assistance tools.

The researchers provide depth maps, semantic segmentation, third-person views, pointing tools and directional information.

Richer visual information does not always improve performance.

In some manipulation tasks, adding depth maps or semantic segmentation brings almost no improvement. A simple interactive cursor, however, can substantially improve arm manipulation success rates.

For example, on a subset of 10 LIBERO tasks, Mythos Preview’s success rate increases from 6% to 32% with the cursor.

Similarly, a compass that provides heading angles brings clear gains in quadruped navigation tasks.

This makes me think that current models’ bottlenecks may include more than “understanding an image”:

**They also need to translate visual information into an accurate spatial state and maintain that state throughout execution.**

A model may recognize an object ahead without accurately knowing its distance. It may understand where a target is, yet lose track of its own orientation after several turns.

The paper also finds that longer reasoning does not consistently improve robotics performance. In some settings, a larger reasoning budget leads to unnecessary complexity and harms immediate control.

In robotics, more visual tokens and a longer chain of thought do not necessarily mean better closed-loop control.

Sometimes, an accurate heading, a distance query or execution-state feedback is more useful than additional reasoning.

## 06. How Far Is Simulation Performance from Real Robots?

Although the paper demonstrates clear progress across model generations, I think the evaluation setup still deserves attention.

This is especially true for Direct Control.

To prevent LLM API latency from dominating results, Anthropic pauses MuJoCo in some direct-control experiments while waiting for the model to generate its next action.

This evaluates the model’s potential physical reasoning and control capabilities under the assumption that it can output actions in time.

A real robot cannot pause the physical world while waiting for an API response.

A quadruped, for example, needs continuous, high-frequency control. If one LLM inference takes seconds or tens of seconds, it cannot serve directly as a low-level real-time controller, however sensible its plan may be.

Anthropic’s physical robot experiments are also primarily exploratory Go2 tests, rather than a real-world benchmark at the same scale as, and strictly aligned with, the simulation benchmark.

I would therefore rather read the work this way:

**It shows the potential robotics capabilities of general-purpose models. It does not establish that these models can already be reliably deployed directly as low-level policies on real robots.**

## 07. Some Research Thoughts of My Own

Connecting this with my previous experience deploying π0.5 on real robots, my strongest impression is that robotics capability cannot be judged solely by the quality of a model’s action predictions.

A VLA can produce seemingly reasonable actions on offline data, yet gradually become unstable during real closed-loop execution because of state errors, control latency or action-chunk boundaries.

This is why Anthropic’s VLA supervisor experiment interests me so much.

If we extend it into a more complete robot agent harness, I think the research question could be:

**Can an agent improve a frozen robot policy through selective, feedback-driven intervention?**

First, freeze an existing VLA and let it execute standard tasks and long-tail tasks with execution deviations independently.

Then introduce a supervisor that uses the current observation, the policy’s proposed action and historical execution feedback to decide whether intervention is necessary.

The most important goal is not to make the supervisor correct as many errors as possible. It is to verify the net benefit of intervention.

The experiment should distinguish at least four settings: the VLA alone, the VLA with equal-budget retries, the VLA with an unconditional supervisor, and the VLA with selective intervention.

Beyond final task success, it should measure incorrect intervention rates, missed intervention rates, recovery success, and the additional time and compute cost of each intervention.

Otherwise, we may simply be adding a new source of errors to an already capable VLA.

Another question worth exploring is whether an agent can turn a correction learned from one failure into a reusable skill, rather than only changing the next action in the current episode.

That would take us from simple online correction toward deployment-time adaptation and skill reuse across tasks.

These are research ideas extending the paper’s results. They are not conclusions that Anthropic has already validated.

## 08. Closing Thoughts

My main takeaway is not which model tops the Embody leaderboard. It is a reason to reconsider the role LLMs should play in robotic systems.

They do not necessarily have to produce every joint action directly, or replace an existing VLA.

Using existing policies, diagnosing execution failures, designing control programs, generating training data and correcting robot behavior at appropriate moments may be more valuable entry points for general-purpose models.

The difficult part is not teaching a model to intervene. It is teaching it **when not to intervene**.

**A good robot agent should not only know how to act, but also when to trust the policy it already has.**

---

### References

Anthropic, *Claude Plays Robotics*, July 9, 2026.

https://www.anthropic.com/research/claude-plays-robotics

The Embody code repository planned for release by the authors:

https://github.com/safety-research/embody

*Note: This article is a personal reading summary and an exploration of ideas prompted by the original research. Experimental figures come from Anthropic’s official article and appendices. The research proposals do not represent results already validated in the original work.*
