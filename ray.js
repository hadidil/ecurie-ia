// Pour le raycasting, voir vidéo de Daniel Shiffman
// sur le sujet : https://www.youtube.com/watch?v=TOEi6T2mtHo
class Ray {
  constructor(pos, angle) {
    this.pos = pos;      // position de la voiture (même objet, le rayon la suit)
    this.angle = angle;  // angle du rayon par rapport à la direction de la voiture
    this.dir = p5.Vector.fromAngle(angle);
  }

  // On fait tourner le rayon avec la voiture (offset = direction de la voiture)
  rotate(offset) {
    this.dir.x = Math.cos(this.angle + offset);
    this.dir.y = Math.sin(this.angle + offset);
  }

  // On dessine le rayon, jusqu'au point touché ou jusqu'à la portée maximale
  show(length) {
    stroke(255, 90, 90, 160);
    strokeWeight(1.5);
    line(this.pos.x, this.pos.y,
         this.pos.x + this.dir.x * length, this.pos.y + this.dir.y * length);
    strokeWeight(1);
  }

  // On regarde si le rayon intersecte un mur
  // si oui on renvoie le point d'intersection {x, y, d} (d = distance à la voiture)
  cast(wall) {
    const x1 = wall.a.x;
    const y1 = wall.a.y;
    const x2 = wall.b.x;
    const y2 = wall.b.y;

    const x3 = this.pos.x;
    const y3 = this.pos.y;
    const x4 = this.pos.x + this.dir.x;
    const y4 = this.pos.y + this.dir.y;

    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (den === 0) return null;

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
    if (t > 0 && t < 1 && u > 0) {
      // dir est de longueur 1 : u est donc directement la distance
      return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1), d: u };
    }
    return null;
  }
}
