import numpy as np

THETA = 0.5


class Node:
    """A square of the quadtree: its centre and side, its mass and centre of mass, and its children or one body."""

    def __init__(self, centre, side):
        self.centre, self.side = centre, side
        self.mass, self.com = 0.0, np.zeros(2)
        self.children, self.body = None, None

    def insert(self, i, r, m):
        # Every node passed on the way down counts the body in its mass and centre of mass.
        self.com = (self.com * self.mass + r[i] * m[i]) / (self.mass + m[i])
        self.mass += m[i]
        if self.children is None and self.body is None:
            self.body = i
            return
        if self.children is None:
            self.children = [Node(self.centre + self.side / 4 * np.array([sx, sy]), self.side / 2) for sx in (-1, 1) for sy in (-1, 1)]
            old, self.body = self.body, None
            self.child(r[old]).insert(old, r, m)
        self.child(r[i]).insert(i, r, m)

    def child(self, p):
        return self.children[2 * (p[0] > self.centre[0]) + (p[1] > self.centre[1])]

    def pull(self, p, eps):
        """The acceleration this node gives a body at p: whole if it is far enough (s/d < θ), else opened."""
        if self.mass == 0 or (self.body is not None and np.allclose(self.com, p)):
            return np.zeros(2)
        d = self.com - p
        dist = np.sqrt(d @ d + eps**2)
        if self.children is None or self.side / dist < THETA:
            return self.mass * d / dist**3
        return sum(c.pull(p, eps) for c in self.children)


def accelerations(r, m, eps=0.01):
    lo, hi = r.min(axis=0), r.max(axis=0)
    root = Node((lo + hi) / 2, max(hi - lo) * 1.001)
    for i in range(len(m)):
        root.insert(i, r, m)
    return np.array([root.pull(p, eps) for p in r])
