import { useEffect, useRef } from "react";
import Phaser from "phaser";

/** A character/NPC the backend has placed in the scene. Position is normalized
 *  (0..1) so the world stays responsive regardless of canvas size. The backend
 *  sim engine is the source of truth for these — Phaser only renders them. */
export interface GameNpc {
  id: string;
  name: string;
  /** Normalized world position (0..1). */
  x: number;
  y: number;
  /** Sprite tint as a hex int (placeholder art). */
  color: number;
  /** Optional status badge (e.g. "sick") rendered above the sprite. */
  status?: string;
}

interface Props {
  playerName?: string;
  npcs: GameNpc[];
  /** Fired when the player walks up to and taps a character/NPC. */
  onInteract: (npcId: string) => void;
  className?: string;
}

const PLAYER_SPEED = 240; // px/sec

/**
 * The interactive 2D world. This is intentionally a thin renderer: it draws a
 * placeholder city floor, the player sprite (click-to-move), and backend-owned
 * NPC sprites. Tapping an NPC walks the player over and emits `onInteract`,
 * which opens the dialogue overlay (the only place the LLM is invoked).
 *
 * Placeholder art for now — a CC0 tileset + sprite pack swaps in here later
 * without changing the interaction contract.
 */
class WorldScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private moveTarget: { x: number; y: number } | null = null;
  private onArrive: (() => void) | null = null;
  private npcNodes: { def: GameNpc; node: Phaser.GameObjects.Container }[] = [];
  private floor!: Phaser.GameObjects.Graphics;

  constructor() {
    super("world");
  }

  create() {
    this.floor = this.add.graphics();
    this.drawFloor();

    // Player sprite (placeholder: rounded body + name tag).
    this.player = this.makeActor(this.scale.width * 0.5, this.scale.height * 0.7, 0x4f8cff, this.registry.get("playerName") || "You");

    this.renderNpcs();

    // Click empty ground to walk there.
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
      if (currentlyOver.length > 0) return; // an NPC handled it
      this.onArrive = null;
      this.moveTarget = { x: pointer.worldX, y: pointer.worldY };
    });

    this.scale.on("resize", this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.handleResize, this);
    });
  }

  private handleResize() {
    this.drawFloor();
    this.npcNodes.forEach(({ def, node }) => {
      node.setPosition(this.scale.width * def.x, this.scale.height * def.y);
    });
  }

  private drawFloor() {
    const { width, height } = this.scale;
    const g = this.floor;
    g.clear();
    g.fillStyle(0x141826, 1);
    g.fillRect(0, 0, width, height);
    // Tile grid to suggest a city plaza/interior floor.
    const tile = 48;
    for (let y = 0; y < height; y += tile) {
      for (let x = 0; x < width; x += tile) {
        const shade = ((x / tile + y / tile) % 2 === 0) ? 0x1b2030 : 0x222942;
        g.fillStyle(shade, 1);
        g.fillRect(x, y, tile - 2, tile - 2);
      }
    }
  }

  private makeActor(x: number, y: number, color: number, name: string): Phaser.GameObjects.Container {
    const body = this.add.rectangle(0, 0, 26, 38, color).setStrokeStyle(2, 0x000000, 0.25);
    const head = this.add.circle(0, -26, 11, color).setStrokeStyle(2, 0x000000, 0.25);
    const tag = this.add
      .text(0, 28, name, { fontFamily: "system-ui, sans-serif", fontSize: "12px", color: "#e7e9f3" })
      .setOrigin(0.5, 0);
    const c = this.add.container(x, y, [body, head, tag]);
    c.setSize(32, 64);
    return c;
  }

  /** Rebuild NPC nodes from the latest backend-provided list. */
  renderNpcs() {
    this.npcNodes.forEach(({ node }) => node.destroy());
    this.npcNodes = [];
    const npcs: GameNpc[] = this.registry.get("npcs") || [];
    npcs.forEach((def) => {
      const node = this.makeActor(this.scale.width * def.x, this.scale.height * def.y, def.color, def.name);
      if (def.status) {
        const badge = this.add
          .text(0, -46, def.status, {
            fontFamily: "system-ui, sans-serif",
            fontSize: "10px",
            color: "#fff",
            backgroundColor: "#b91c1c",
            padding: { x: 4, y: 2 },
          })
          .setOrigin(0.5, 0.5);
        node.add(badge);
      }
      // Hit area = the body rectangle region.
      node.setInteractive(new Phaser.Geom.Rectangle(-16, -38, 32, 70), Phaser.Geom.Rectangle.Contains);
      node.on("pointerover", () => this.game.canvas.style.setProperty("cursor", "pointer"));
      node.on("pointerout", () => this.game.canvas.style.setProperty("cursor", "default"));
      node.on("pointerdown", () => this.walkToNpc(def, node));
      this.npcNodes.push({ def, node });
    });
  }

  private walkToNpc(def: GameNpc, node: Phaser.GameObjects.Container) {
    this.moveTarget = { x: node.x - 44, y: node.y };
    this.onArrive = () => {
      const cb = this.registry.get("onInteract") as ((id: string) => void) | undefined;
      cb?.(def.id);
    };
  }

  update(_time: number, delta: number) {
    if (!this.moveTarget) return;
    const dx = this.moveTarget.x - this.player.x;
    const dy = this.moveTarget.y - this.player.y;
    const dist = Math.hypot(dx, dy);
    const step = (PLAYER_SPEED * delta) / 1000;
    if (dist <= step) {
      this.player.setPosition(this.moveTarget.x, this.moveTarget.y);
      this.moveTarget = null;
      const arrive = this.onArrive;
      this.onArrive = null;
      arrive?.();
      return;
    }
    this.player.setPosition(this.player.x + (dx / dist) * step, this.player.y + (dy / dist) * step);
  }
}

export default function GameCanvas({ playerName = "You", npcs, onInteract, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  // Create the game once; keep live values in the registry so prop changes
  // don't tear down the canvas.
  useEffect(() => {
    if (!hostRef.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      backgroundColor: "#141826",
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: WorldScene,
      banner: false,
    });
    game.registry.set("playerName", playerName);
    game.registry.set("npcs", npcs);
    game.registry.set("onInteract", onInteract);
    gameRef.current = game;
    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push live prop updates into the running game.
  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    game.registry.set("onInteract", onInteract);
    game.registry.set("playerName", playerName);
    game.registry.set("npcs", npcs);
    const scene = game.scene.getScene("world") as WorldScene | null;
    scene?.renderNpcs();
  }, [npcs, onInteract, playerName]);

  return <div ref={hostRef} className={className ?? "h-full w-full"} />;
}
