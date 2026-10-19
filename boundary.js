// Un segment : sert pour les murs du circuit et pour les checkpoints
class Boundary {
  constructor(x1, y1, x2, y2) {
    this.a = createVector(x1, y1);
    this.b = createVector(x2, y2);
    // milieu du segment, calculé une fois pour toutes
    this.mx = (x1 + x2) * 0.5;
    this.my = (y1 + y2) * 0.5;
    // sens de la course au niveau de ce checkpoint (rempli par buildTrack)
    this.fx = 0;
    this.fy = 0;
  }

  midpoint() {
    return createVector(this.mx, this.my);
  }

  show() {
    stroke(255);
    line(this.a.x, this.a.y, this.b.x, this.b.y);
  }
}
