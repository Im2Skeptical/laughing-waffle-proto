// Freestanding silhouettes: identity comes from the outline, not a badge or letter.
export function drawLifeMapNodeIcon(graphics, node, { fill, accent, outline }) {
  const variant = node.signatureNode?.variantId;
  const kind = ({ legacyPlus: 'legacy', removePractice: 'practiceReform',
    removeStructure: 'publicWorks', removeRoute: 'routes', knowledgeShop: 'development',
    housingShop: 'settlement' })[variant] ?? variant ?? node.family;
  const polygon = points => graphics.lineStyle(3, outline, 1).beginFill(fill).drawPolygon(points).endFill();
  const line = (points, width = 4, color = outline) => {
    graphics.lineStyle(width, color, 1).moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) graphics.lineTo(points[i], points[i + 1]);
  };
  switch (kind) {
    case 'patronage': // A tied purse, broad base and narrow neck.
      polygon([-12,-29, 12,-29, 7,-16, 22,0, 26,20, 15,29, -15,29, -26,20, -22,0, -7,-16]);
      line([-12,-14,12,-14],5,accent); line([0,-3,0,17],5,accent);
      break;
    case 'development': // Open book.
      polygon([-29,-23,-10,-25,0,-18,10,-25,29,-23,29,22,10,20,0,27,-10,20,-29,22]);
      line([0,-17,0,24]); line([-22,-12,-9,-11]); line([9,-11,22,-12]);
      line([-22,0,-9,1],3,accent); line([9,1,22,0],3,accent);
      break;
    case 'travel': // Walking boot.
      polygon([-19,-29,7,-29,7,0,23,9,29,13,29,26,-26,26,-26,12,-19,3]);
      line([-24,18,27,18],4,accent); line([-14,-18,3,-18]); line([-14,-8,3,-8]);
      break;
    case 'practiceReform': // Diagonal workshop hammer.
      polygon([-24,24,-17,30,14,-8,7,-15]);
      polygon([-9,-25,1,-32,28,-11,18,1,7,-10,2,-6,-9,-16]);
      line([-20,22,-14,27],4,accent);
      break;
    case 'publicWorks': // Crenellated tower.
      polygon([-25,29,-25,20,-19,20,-19,-8,-26,-8,-26,-29,-14,-29,-14,-20,-6,-20,-6,-29,6,-29,6,-20,14,-20,14,-29,26,-29,26,-8,19,-8,19,20,25,20,25,29]);
      line([-6,27,-6,10,6,10,6,27],6); line([-10,-4,10,-4],4,accent);
      break;
    case 'routes': // Bridge with a visible arch and piers.
      polygon([-31,24,-31,-3,-25,-3,-25,-22,-18,-22,-18,-7,18,-7,18,-22,25,-22,25,-3,31,-3,31,24,17,24,17,12,10,2,-10,2,-17,12,-17,24]);
      line([-29,-3,29,-3],4,accent);
      break;
    case 'settlement':
      polygon([-31,-3,0,-30,31,-3,23,2,23,27,7,27,7,9,-7,9,-7,27,-23,27,-23,2]);
      line([-23,-3,0,-23,23,-3],4,accent);
      break;
    case 'crisis': // Jagged lightning bolt.
      polygon([1,-33,-25,5,-6,5,-15,33,27,-12,6,-12,16,-33]);
      break;
    case 'legacy':
      polygon([-30,-23,-14,-10,0,-31,14,-10,30,-23,23,25,-23,25]);
      line([-23,14,23,14],5,accent); polygon([-5,-2,0,-9,5,-2,0,5]);
      break;
    case 'monsterHunt': // Horned skull.
      polygon([-14,-19,-30,-32,-27,-7,-20,3,-18,18,-8,20,-8,29,8,29,8,20,18,18,20,3,27,-7,30,-32,14,-19,0,-24]);
      line([-14,-3,-5,1],7); line([5,1,14,-3],7); line([0,12,0,19],4,accent);
      break;
    case 'foodShop': // Ear of grain.
      line([0,30,0,-28],5,fill);
      for (const y of [-18,-3,12]) {
        polygon([0,y+9,-18,y,-21,y-14,-5,y-8]);
        polygon([0,y+9,18,y,21,y-14,5,y-8]);
      }
      break;
    default:
      polygon([0,-32,9,-10,31,-10,14,5,21,29,0,15,-21,29,-14,5,-31,-10,-9,-10]);
  }
  if (variant?.startsWith('remove')) {
    line([-26,29,27,-28],9,outline);
    line([-26,29,27,-28],4,accent);
  }
  if (node.signatureNode) {
    graphics.lineStyle(2,outline).beginFill(accent)
      .drawPolygon([27,-39,31,-31,39,-27,31,-23,27,-15,23,-23,15,-27,23,-31]).endFill();
  }
}
