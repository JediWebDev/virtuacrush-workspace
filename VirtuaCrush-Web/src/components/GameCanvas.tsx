import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { assetUrl } from "../lib/api";
import type { SceneInteractable, SceneMap } from "../game/scenes";

/** The companion placed in the scene. The backend sim owns who/where; Phaser
 *  only renders them and reports interactions. */
export interface GameNpc {
  id: string;
  name: string;
  /** Optional status badge (e.g. "sick") rendered above the sprite. */
  status?: string;
}

interface Props {
  scene: SceneMap;
  npc?: GameNpc | null;
  playerName?: string;
  /** Player walked up to / tapped the character — opens the dialogue overlay. */
  onInteractNpc: (npcId: string) => void;
  /** Player walked up to / tapped an interactive object or a door. */
  onInteractObject: (interactable: SceneInteractable) => void;
  /** The object the player is currently standing on, or null. Lets the UI show
   *  a contextual prompt. */
  onNearChange?: (interactable: SceneInteractable | null) => void;
  /** Draws physics bodies and prints drag-drawn rectangles to the console. */
  debug?: boolean;
  className?: string;
}

const PLAYER_SPEED = 230; // px/sec
const ARRIVE_DIST = 8; // px

const REG = {
  scene: "scene",
  npc: "npc",
  playerName: "playerName",
  onInteractNpc: "onInteractNpc",
  onInteractObject: "onInteractObject",
  onNearChange: "onNearChange",
  mapUrl: "mapUrl",
  debug: "debug",
} as const;

/**
 * The interactive 2D world. A single background image per location with
 * invisible static collision rectangles and overlap zones for objects/doors
 * (all defined in src/game/scenes.ts). Movement is click-to-move with Arcade
 * physics; tapping a character opens dialogue (the only LLM touch-point) and
 * tapping an object/door fires the engine action. Falls back to a procedural
 * floor when the map image is absent.
 */
class WorldScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerTag!: Phaser.GameObjects.Text;
  private npcSprite: Phaser.Physics.Arcade.Sprite | null = null;
  private npcTag: Phaser.GameObjects.Text | null = null;
  private npcBadge: Phaser.GameObjects.Text | null = null;
  private zones: { def: SceneInteractable; zone: Phaser.GameObjects.Zone; label: Phaser.GameObjects.Text }[] = [];
  private moveTarget: { x: number; y: number } | null = null;
  private onArrive: (() => void) | null = null;
  private near: SceneInteractable | null = null;
  private dragStart: { x: number; y: number } | null = null;

  constructor() {
    super("world");
  }

  private get config(): SceneMap {
    return this.registry.get(REG.scene) as SceneMap;
  }

  preload() {
    const url = this.registry.get(REG.mapUrl) as string | undefined;
    if (url) {
      this.load.image("mapbg", url);
      // Don't let a missing/broken map break the world — fall back to a floor.
      this.load.once("loaderror", () => this.registry.set("mapMissing", true));
    }
  }

  create() {
    const cfg = this.config;
    const { worldWidth: W, worldHeight: H } = cfg;
    const debug = Boolean(this.registry.get(REG.debug));

    this.physics.world.setBounds(0, 0, W, H);
    this.cameras.main.setBounds(0, 0, W, H);

    // Background: map image if it loaded, else a procedural floor.
    if (this.textures.exists("mapbg") && !this.registry.get("mapMissing")) {
      this.add.image(0, 0, "mapbg").setOrigin(0, 0).setDisplaySize(W, H);
    } else {
      this.drawFloor(W, H);
    }

    this.makeActorTexture();

    // Static collision bodies.
    const walls: Phaser.GameObjects.GameObject[] = [];
    cfg.collisions.forEach((r) => {
      const rect = this.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, 0xff3366, debug ? 0.25 : 0);
      this.physics.add.existing(rect, true);
      walls.push(rect);
    });

    // Player.
    this.player = this.physics.add.sprite(cfg.spawn.x, cfg.spawn.y, "actor").setTint(0x4f8cff);
    this.player.setDepth(10);
    this.player.body.setSize(22, 18).setOffset(5, 30);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, walls);
    this.playerTag = this.makeTag(this.registry.get(REG.playerName) || "You");

    // Interaction zones (objects + doors).
    cfg.interactables.forEach((def) => {
      const zone = this.add.zone(def.x + def.w / 2, def.y + def.h / 2, def.w, def.h);
      this.physics.add.existing(zone, true);
      if (debug) {
        this.add.rectangle(def.x + def.w / 2, def.y + def.h / 2, def.w, def.h, 0x38bdf8, 0.2).setDepth(1);
      }
      const label = this.add
        .text(def.x + def.w / 2, def.y - 6, def.label, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "14px",
          color: "#0b1120",
          backgroundColor: "#7dd3fc",
          padding: { x: 6, y: 3 },
        })
        .setOrigin(0.5, 1)
        .setDepth(30)
        .setVisible(false);
      zone.setInteractive({ useHandCursor: true });
      zone.on("pointerover", () => label.setVisible(true));
      zone.on("pointerout", () => { if (this.near?.id !== def.id) label.setVisible(false); });
      zone.on("pointerdown", () => this.walkToInteractable(def));
      this.zones.push({ def, zone, label });
    });

    this.renderNpc();

    // Click empty ground to walk there.
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (debug) this.dragStart = { x: pointer.worldX, y: pointer.worldY };
      if (over.length > 0) return; // a zone/NPC handled it
      this.onArrive = null;
      this.moveTo(pointer.worldX, pointer.worldY);
    });
    if (debug) {
      this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
        if (!this.dragStart) return;
        const x = Math.round(Math.min(this.dragStart.x, pointer.worldX));
        const y = Math.round(Math.min(this.dragStart.y, pointer.worldY));
        const w = Math.round(Math.abs(pointer.worldX - this.dragStart.x));
        const h = Math.round(Math.abs(pointer.worldY - this.dragStart.y));
        this.dragStart = null;
        if (w > 4 && h > 4) console.log(`[scene-author] { x: ${x}, y: ${y}, w: ${w}, h: ${h} },`);
        else console.log(`[scene-author] point { x: ${x}, y: ${y} }`);
      });
    }

    this.fitCamera();
    this.scale.on("resize", this.fitCamera, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off("resize", this.fitCamera, this));
  }

  private fitCamera() {
    const cfg = this.config;
    const zoom = Math.min(this.scale.width / cfg.worldWidth, this.scale.height / cfg.worldHeight);
    this.cameras.main.setZoom(zoom > 0 ? zoom : 1);
    this.cameras.main.centerOn(cfg.worldWidth / 2, cfg.worldHeight / 2);
  }

  private drawFloor(W: number, H: number) {
    const g = this.add.graphics();
    g.fillStyle(0x141826, 1);
    g.fillRect(0, 0, W, H);
    const tile = 48;
    for (let y = 0; y < H; y += tile) {
      for (let x = 0; x < W; x += tile) {
        g.fillStyle((x / tile + y / tile) % 2 === 0 ? 0x1b2030 : 0x222942, 1);
        g.fillRect(x, y, tile - 2, tile - 2);
      }
    }
  }

  /** Builds a reusable silhouette texture tinted per actor. */
  private makeActorTexture() {
    if (this.textures.exists("actor")) return;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(4, 16, 24, 32, 7); // body
    g.fillCircle(16, 11, 10); // head
    g.lineStyle(2, 0x0b1120, 0.25);
    g.strokeRoundedRect(4, 16, 24, 32, 7);
    g.generateTexture("actor", 32, 50);
    g.destroy();
  }

  private makeTag(text: string): Phaser.GameObjects.Text {
    return this.add
      .text(0, 0, text, { fontFamily: "system-ui, sans-serif", fontSize: "12px", color: "#e7e9f3" })
      .setOrigin(0.5, 0)
      .setDepth(31);
  }

  /** Rebuild the companion sprite from the latest backend-provided info. */
  renderNpc() {
    this.npcSprite?.destroy();
    this.npcTag?.destroy();
    this.npcBadge?.destroy();
    this.npcSprite = null;
    this.npcTag = null;
    this.npcBadge = null;

    const npc = this.registry.get(REG.npc) as GameNpc | null | undefined;
    if (!npc) return;
    const cfg = this.config;
    const sprite = this.physics.add.staticSprite(cfg.npcAnchor.x, cfg.npcAnchor.y, "actor").setTint(0xff5aa2);
    sprite.setDepth(10);
    sprite.setInteractive({ useHandCursor: true });
    sprite.on("pointerover", () => this.game.canvas.style.setProperty("cursor", "pointer"));
    sprite.on("pointerout", () => this.game.canvas.style.setProperty("cursor", "default"));
    sprite.on("pointerdown", () => this.walkToNpc(npc, cfg.npcAnchor.x, cfg.npcAnchor.y));
    this.npcSprite = sprite;
    this.npcTag = this.makeTag(npc.name);
    if (npc.status) {
      this.npcBadge = this.add
        .text(cfg.npcAnchor.x, cfg.npcAnchor.y - 44, npc.status, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "10px",
          color: "#fff",
          backgroundColor: "#b91c1c",
          padding: { x: 4, y: 2 },
        })
        .setOrigin(0.5, 0.5)
        .setDepth(31);
    }
  }

  private moveTo(x: number, y: number) {
    this.moveTarget = { x, y };
    this.physics.moveTo(this.player, x, y, PLAYER_SPEED);
  }

  private walkToNpc(npc: GameNpc, x: number, y: number) {
    // Walk toward the character for the RPG feel, but open dialogue immediately
    // on tap so it always registers (especially on touch).
    this.onArrive = null;
    this.moveTo(x - 56, y);
    (this.registry.get(REG.onInteractNpc) as ((id: string) => void) | undefined)?.(npc.id);
  }

  private walkToInteractable(def: SceneInteractable) {
    const cx = def.x + def.w / 2;
    const cy = def.y + def.h / 2;
    const fire = () => (this.registry.get(REG.onInteractObject) as ((it: SceneInteractable) => void) | undefined)?.(def);
    // Already standing on it? Fire now. Otherwise walk up, then fire.
    if (this.near?.id === def.id) {
      fire();
      return;
    }
    this.onArrive = fire;
    this.moveTo(cx, cy + def.h / 2 + 20);
  }

  update() {
    // Arrival.
    if (this.moveTarget) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.moveTarget.x, this.moveTarget.y);
      if (d <= ARRIVE_DIST) {
        this.player.setVelocity(0, 0);
        this.player.setPosition(this.moveTarget.x, this.moveTarget.y);
        this.moveTarget = null;
        const arrive = this.onArrive;
        this.onArrive = null;
        arrive?.();
      }
    }

    // Tags follow their actors.
    this.playerTag.setPosition(this.player.x, this.player.y + 26);

    // Proximity → contextual prompt.
    let near: SceneInteractable | null = null;
    for (const { def, zone, label } of this.zones) {
      const inside = this.physics.overlap(this.player, zone);
      label.setVisible(inside);
      if (inside) near = def;
    }
    if (near?.id !== this.near?.id) {
      this.near = near;
      (this.registry.get(REG.onNearChange) as ((it: SceneInteractable | null) => void) | undefined)?.(near);
    }
  }
}

export default function GameCanvas({
  scene,
  npc,
  playerName = "You",
  onInteractNpc,
  onInteractObject,
  onNearChange,
  debug = false,
  className,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  // (Re)create the game when the location or debug flag changes — the map image
  // is loaded in preload, so a new location needs a fresh boot.
  useEffect(() => {
    if (!hostRef.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      backgroundColor: "#0b1120",
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      physics: { default: "arcade", arcade: { debug } },
      scene: WorldScene,
      banner: false,
    });
    game.registry.set(REG.scene, scene);
    game.registry.set(REG.npc, npc ?? null);
    game.registry.set(REG.playerName, playerName);
    game.registry.set(REG.onInteractNpc, onInteractNpc);
    game.registry.set(REG.onInteractObject, onInteractObject);
    game.registry.set(REG.onNearChange, onNearChange);
    game.registry.set(REG.mapUrl, scene.mapKey ? assetUrl(scene.mapKey) : undefined);
    game.registry.set(REG.debug, debug);
    game.registry.set("mapMissing", false);
    gameRef.current = game;
    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id, debug]);

  // Push live updates (callbacks, companion) without tearing the canvas down.
  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    game.registry.set(REG.npc, npc ?? null);
    game.registry.set(REG.playerName, playerName);
    game.registry.set(REG.onInteractNpc, onInteractNpc);
    game.registry.set(REG.onInteractObject, onInteractObject);
    game.registry.set(REG.onNearChange, onNearChange);
    const ws = game.scene.getScene("world") as WorldScene | null;
    ws?.renderNpc();
  }, [npc, playerName, onInteractNpc, onInteractObject, onNearChange]);

  return <div ref={hostRef} className={className ?? "h-full w-full"} />;
}
