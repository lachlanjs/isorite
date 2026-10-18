---
type: Concept
title: Symplectic integrators
description: Integrators that keep the geometry of Hamiltonian motion, and so keep energy without drifting.
---

The exact motion of [the N-body problem](/physics/the-n-body-problem.md "requires") is Hamiltonian, and its flow preserves areas in phase space (positions against momenta). An integrator whose step preserves them too is symplectic.

Such an integrator conserves exactly a slightly different energy, $\tilde H = H + O(\Delta t^2)$ for a second-order method. Since $\tilde H$ is constant and close to $H$, the true [energy](/physics/energy-conservation.md "uses") can only wobble around its start, never drift away: the error is bounded for as long as you run.

Leapfrog is symplectic. Classical Runge–Kutta (RK4) is not: it is more accurate per step, but its energy drifts slowly over long runs.
