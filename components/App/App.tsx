/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useState, useRef } from 'react';
import { em } from '@lib/engine/engine_manager';
import { screenManager } from '@lib/screen/screen_manager';
import { Screen } from '@lib/screen/screen';
import { gfx3Manager } from '@lib/gfx3/gfx3_manager';
import { gfx3MeshRenderer } from '@lib/gfx3_mesh/gfx3_mesh_renderer';
import { gfx3PostRenderer, PostParam } from '@lib/gfx3_post/gfx3_post_renderer';
import { gfx3JoltManager, JOLT_LAYER_MOVING, JOLT_RVEC3_TO_VEC3, VEC3_TO_JOLT_RVEC3, Gfx3Jolt } from '@lib/gfx3_jolt/gfx3_jolt_manager';
import { Gfx3Camera } from '@lib/gfx3_camera/gfx3_camera';
import { Gfx3Mesh } from '@lib/gfx3_mesh/gfx3_mesh';
import { Quaternion } from '@lib/core/quaternion';
import { UT } from '@lib/core/utils';
import { eventManager } from '@lib/core/event_manager';
import { Gfx3Drawable, Gfx3MeshEffect } from '@lib/gfx3/gfx3_drawable';
import { inputManager } from '@lib/input/input_manager';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, Crosshair, ArrowsDownUp, Cpu, Activity, Shield, Sword, Wrench } from 'phosphor-react';
import { Tank } from './game/Tank';
import { Environment } from './game/Environment';
import { Enemy } from './game/Enemy';
import { Explosion } from './game/Explosion';
import { createBoxMesh } from './game/GameUtils';
import { coreManager, SizeMode } from '@lib/core/core_manager';
import { GameScreen } from './game/GameScreen';

// --- UI TOKENS ---

const TOKENS = {
    Color: {
        Surface: {
            Main: '#0A0B0D',
            Card: 'rgba(20, 22, 26, 0.7)',
            Accent: '#F97316',
            Danger: '#DC2626',
        },
        Content: {
            Primary: '#FFFFFF',
            Secondary: 'rgba(255, 255, 255, 0.6)',
            Muted: 'rgba(255, 255, 255, 0.3)',
        },
        Border: 'rgba(255, 255, 255, 0.1)',
    },
    Typography: {
        Hero: { fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.05em' },
        Body: { fontFamily: 'Inter, sans-serif' },
        Data: { fontFamily: 'JetBrains Mono, monospace' },
    }
};

// --- SUB-COMPONENTS ---

const StatusBadge = ({ icon: Icon, label, value, color = TOKENS.Color.Content.Primary }: any) => (
    <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        padding: '12px',
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '8px',
        border: `1px solid ${TOKENS.Color.Border}`,
        minWidth: '100px'
    }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: TOKENS.Color.Content.Secondary }}>
            <Icon size={14} weight="bold" />
            <span style={{ ...TOKENS.Typography.Body, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        </div>
        <div style={{ ...TOKENS.Typography.Data, fontSize: '18px', fontWeight: 700, color }}>{value}</div>
    </div>
);

const ControlHint = ({ k, action }: { k: string, action: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ 
            ...TOKENS.Typography.Data, 
            fontSize: '10px', 
            background: 'rgba(255,255,255,0.1)', 
            padding: '2px 6px', 
            borderRadius: '4px',
            color: TOKENS.Color.Content.Primary,
            border: `1px solid ${TOKENS.Color.Border}`
        }}>{k}</span>
        <span style={{ ...TOKENS.Typography.Body, fontSize: '10px', color: TOKENS.Color.Content.Secondary, textTransform: 'uppercase' }}>{action}</span>
    </div>
);

const Joystick = ({ onChange }: { onChange: (dir: { x: number, y: number }) => void }) => {
    const [dragging, setDragging] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        setDragging(true);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!dragging || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        let dx = e.clientX - centerX;
        let dy = e.clientY - centerY;
        
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = rect.width / 2;
        
        if (dist > maxDist) {
            dx = (dx / dist) * maxDist;
            dy = (dy / dist) * maxDist;
        }
        
        setPos({ x: dx, y: dy });
        onChange({ x: dx / maxDist, y: dy / maxDist });
    };

    const handlePointerUp = () => {
        setDragging(false);
        setPos({ x: 0, y: 0 });
        onChange({ x: 0, y: 0 });
    };

    return (
        <div 
            ref={containerRef}
            style={{
                width: '128px',
                height: '128px',
                borderRadius: '50%',
                border: `2px solid ${TOKENS.Color.Border}`,
                background: 'rgba(255, 255, 255, 0.05)',
                backdropFilter: 'blur(10px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                touchAction: 'none'
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
        >
            <motion.div 
                style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: TOKENS.Color.Content.Primary,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                    pointerEvents: 'none'
                }}
                animate={{ x: pos.x, y: pos.y }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            />
            {/* Visual rings */}
            <div style={{ position: 'absolute', inset: '24px', border: `1px dashed ${TOKENS.Color.Muted}`, borderRadius: '50%', pointerEvents: 'none' }} />
        </div>
    );
};

// --- APP COMPONENT ---

const App = () => {
    const [isReady, setIsReady] = useState(false);
    const [enemyCount, setEnemyCount] = useState(0);
    const gameScreenRef = useRef<GameScreen | null>(null);

    useEffect(() => {
        const handleContextMenu = (e: MouseEvent) => e.preventDefault();
        document.addEventListener('contextmenu', handleContextMenu);

        const handleResize = () => {
            coreManager.setSize(window.innerWidth, window.innerHeight, SizeMode.FULL);
            gfx3Manager.resize();
        };
        window.addEventListener('resize', handleResize);

        const init = async () => {
            // Wait for DOM
            await new Promise(resolve => setTimeout(resolve, 500));
            
            handleResize();
            
            const screen = new GameScreen();
            gameScreenRef.current = screen;
            screenManager.requestSetScreen(screen);
            
            await screen.onEnter();
            
            em.startup(false);
            setIsReady(true);

            // Simple loop for UI data
            const uiLoop = () => {
                if (gameScreenRef.current) {
                    setEnemyCount(gameScreenRef.current.enemies.filter(e => e.hp > 0).length);
                }
                requestAnimationFrame(uiLoop);
            };
            uiLoop();
        };

        init();

        return () => {
            document.removeEventListener('contextmenu', handleContextMenu);
            window.removeEventListener('resize', handleResize);
            em.pause();
        };
    }, []);

    const handleJoystickChange = (dir: { x: number, y: number }) => {
        if (gameScreenRef.current) {
            gameScreenRef.current.moveDir = dir;
        }
    };

    const activeFires = useRef<Set<string>>(new Set());

    const handleFireDown = (e: React.PointerEvent | React.MouseEvent | React.TouchEvent, type: 'normal' | 'grenade') => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        activeFires.current.add(type);
        if (gameScreenRef.current) gameScreenRef.current.virtualFire = type;
        (e.target as HTMLElement).setPointerCapture((e as any).pointerId);
    };

    const handleFireUp = (e: React.PointerEvent | React.MouseEvent | React.TouchEvent, type: 'normal' | 'grenade') => {
        activeFires.current.delete(type);
        if (gameScreenRef.current) {
            if (activeFires.current.has('grenade')) gameScreenRef.current.virtualFire = 'grenade';
            else if (activeFires.current.has('normal')) gameScreenRef.current.virtualFire = 'normal';
            else gameScreenRef.current.virtualFire = 'none';
        }
        try { (e.target as HTMLElement).releasePointerCapture((e as any).pointerId); } catch (err) {}
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '32px',
            overflow: 'hidden',
        }}>
            <AnimatePresence>
                {!isReady && (
                    <motion.div 
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: TOKENS.Color.Surface.Main,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 100,
                            pointerEvents: 'auto'
                        }}
                    >
                        <motion.div
                            animate={{ opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            style={{ ...TOKENS.Typography.Hero, fontSize: '32px', color: TOKENS.Color.Content.Primary, letterSpacing: '0.2em' }}
                        >
                            LINKING NEURAL INTERFACE...
                        </motion.div>
                        <div style={{ width: '200px', height: '2px', background: 'rgba(255,255,255,0.1)', marginTop: '24px', position: 'relative', overflow: 'hidden' }}>
                            <motion.div 
                                animate={{ x: [-200, 200] }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                                style={{ position: 'absolute', top: 0, left: 0, width: '100px', height: '100%', background: TOKENS.Color.Surface.Accent }}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* TOP BAR */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ pointerEvents: 'auto' }}>
                    <h1 style={{ 
                        ...TOKENS.Typography.Hero, 
                        fontSize: '48px', 
                        color: TOKENS.Color.Content.Primary, 
                        margin: 0,
                        textShadow: '0 0 20px rgba(249,115,22,0.4)'
                    }}>TANK_COMMAND (v2.0)</h1>
                    <div style={{ 
                        background: TOKENS.Color.Card, 
                        backdropFilter: 'blur(10px)',
                        padding: '16px', 
                        borderRadius: '12px', 
                        border: `1px solid ${TOKENS.Color.Border}`,
                        marginTop: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <Activity size={16} color={TOKENS.Color.Surface.Accent} />
                            <span style={{ ...TOKENS.Typography.Body, fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: TOKENS.Color.Content.Secondary }}>System Diagnostics</span>
                        </div>
                        <ControlHint k="WASD" action="Drive" />
                        <ControlHint k="MOUSE" action="Aim" />
                        <ControlHint k="SPACE" action="Primary" />
                        <ControlHint k="L/R CLK" action="Weapon Selection" />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', pointerEvents: 'auto' }}>
                    <StatusBadge icon={ArrowsDownUp} label="Enemies" value={enemyCount} color={enemyCount === 0 ? '#4ADE80' : TOKENS.Color.Content.Primary} />
                    <StatusBadge icon={Cpu} label="Engine" value="GPU" />
                </div>
            </div>
            
            {/* CROSSHAIR PLACEHOLDER (Middle of screen) */}
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.5 }}>
               <div style={{ width: '20px', height: '1px', background: 'white', position: 'absolute', top: 0, left: '-10px' }} />
               <div style={{ height: '20px', width: '1px', background: 'white', position: 'absolute', top: '-10px', left: 0 }} />
            </div>

            {/* BOTTOM BAR */}
            <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'flex-end', 
                pointerEvents: 'auto',
                width: '100%',
                maxWidth: '1200px',
                margin: '0 auto'
            }}>
                <Joystick onChange={handleJoystickChange} />
                
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '24px' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                            <span style={{ ...TOKENS.Typography.Data, fontSize: '10px', color: TOKENS.Color.Content.Secondary }}>AUX WEP</span>
                            <motion.button 
                                whileTap={{ scale: 0.9, rotate: -5 }}
                                onPointerDown={(e) => handleFireDown(e, 'grenade')}
                                onPointerUp={(e) => handleFireUp(e, 'grenade')}
                                onPointerLeave={(e) => handleFireUp(e, 'grenade')}
                                onContextMenu={(e) => e.preventDefault()}
                                style={{
                                    width: '64px',
                                    height: '64px',
                                    borderRadius: '50%',
                                    background: `linear-gradient(135deg, ${TOKENS.Color.Surface.Accent}, #C2410C)`,
                                    border: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'white',
                                    boxShadow: `0 8px 24px rgba(249,115,22,0.4), inset 0 2px 4px rgba(255,255,255,0.3)`,
                                    cursor: 'pointer',
                                    touchAction: 'none'
                                }}
                            >
                                <Sword size={28} weight="duotone" />
                            </motion.button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                            <span style={{ ...TOKENS.Typography.Data, fontSize: '12px', color: TOKENS.Color.Content.Secondary, fontWeight: 700 }}>FIRE_MAIN</span>
                            <motion.button 
                                whileTap={{ scale: 0.92 }}
                                onPointerDown={(e) => handleFireDown(e, 'normal')}
                                onPointerUp={(e) => handleFireUp(e, 'normal')}
                                onPointerLeave={(e) => handleFireUp(e, 'normal')}
                                onContextMenu={(e) => e.preventDefault()}
                                style={{
                                    width: '96px',
                                    height: '96px',
                                    borderRadius: '24px',
                                    background: `linear-gradient(135deg, ${TOKENS.Color.Surface.Danger}, #991B1B)`,
                                    border: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'white',
                                    boxShadow: `0 12px 40px rgba(220,38,38,0.5), inset 0 2px 8px rgba(255,255,255,0.4)`,
                                    cursor: 'pointer',
                                    touchAction: 'none'
                                }}
                            >
                                <Crosshair size={44} weight="bold" />
                            </motion.button>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                @font-face {
                    font-family: 'Cause';
                    src: url('https://fonts.googleapis.com/css2?family=Cause:wght@100..900&display=swap');
                }
                canvas {
                    image-rendering: pixelated;
                }
            `}</style>
        </div>
    );
};

export default App;
