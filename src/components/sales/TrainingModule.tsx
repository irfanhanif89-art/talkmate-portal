'use client'

import { useRef } from 'react'
import { Check, ChevronDown, Circle } from 'lucide-react'
import type { ContentBlock, PlanCard, TrainingModule as TModule } from '@/lib/training-modules'

interface TrainingModuleProps {
  module: TModule
  isCompleted: boolean
  isExpanded: boolean
  onToggle: (moduleId: number) => void
  onComplete: (moduleId: number) => void
}

const FONT = 'Outfit, sans-serif'

export default function TrainingModule({
  module,
  isCompleted,
  isExpanded,
  onToggle,
  onComplete,
}: TrainingModuleProps) {
  const bodyRef = useRef<HTMLDivElement>(null)

  return (
    <div
      style={{
        background: 'white',
        border: isExpanded ? '1px solid #E8622A' : '1px solid #E6EAF0',
        borderRadius: 14,
        marginBottom: 14,
        overflow: 'hidden',
        boxShadow: isExpanded
          ? '0 6px 24px rgba(6,19,34,0.10)'
          : '0 1px 3px rgba(6,19,34,0.05)',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        fontFamily: FONT,
      }}
    >
      {/* Header (click to expand) */}
      <button
        onClick={() => onToggle(module.id)}
        aria-expanded={isExpanded}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '18px 20px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: FONT,
        }}
      >
        {/* Number circle */}
        <div
          style={{
            flexShrink: 0,
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: '#E8622A',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 17,
            fontWeight: 800,
          }}
        >
          {module.id}
        </div>

        {/* Title block */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, color: '#061322' }}>
              {module.title}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#6B7280',
                background: '#F1F4F8',
                borderRadius: 20,
                padding: '2px 10px',
              }}
            >
              {module.duration}
            </span>
          </div>
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 3 }}>
            {module.subtitle}
          </div>
        </div>

        {/* Status + chevron */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          {isCompleted ? (
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: '#22C55E',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Check size={16} color="white" strokeWidth={3} />
            </span>
          ) : (
            <Circle size={22} color="#D1D5DB" />
          )}
          <ChevronDown
            size={20}
            color="#9AA7B8"
            style={{
              transition: 'transform 0.25s ease',
              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </div>
      </button>

      {/* Expandable body */}
      <div
        style={{
          maxHeight: isExpanded ? (bodyRef.current?.scrollHeight ?? 6000) + 120 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.35s ease',
        }}
      >
        <div ref={bodyRef} style={{ padding: '4px 22px 22px' }}>
          <div style={{ borderTop: '1px solid #EEF1F5', paddingTop: 18 }}>
            {module.blocks.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </div>

          {/* Completion control */}
          <div style={{ marginTop: 22 }}>
            {isCompleted ? (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 16px',
                  borderRadius: 9,
                  background: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  color: '#15803D',
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                <Check size={16} strokeWidth={3} /> Completed
              </div>
            ) : (
              <button
                onClick={() => onComplete(module.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '11px 20px',
                  borderRadius: 9,
                  background: '#22C55E',
                  border: 'none',
                  color: 'white',
                  fontFamily: FONT,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Check size={16} strokeWidth={3} /> Mark as Complete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- Content block renderer ---------- */

function Block({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'paragraph':
      return (
        <p style={{ fontSize: 15, lineHeight: 1.7, color: '#374151', margin: '0 0 14px' }}>
          {block.content}
        </p>
      )

    case 'heading':
      return (
        <h3
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: '#061322',
            margin: '20px 0 10px',
            letterSpacing: '-0.2px',
          }}
        >
          {block.content}
        </h3>
      )

    case 'bullets':
      return (
        <ul style={{ margin: '0 0 14px', paddingLeft: 0, listStyle: 'none' }}>
          {(block.items ?? []).map((item, i) => (
            <li
              key={i}
              style={{
                position: 'relative',
                paddingLeft: 22,
                fontSize: 15,
                lineHeight: 1.6,
                color: '#374151',
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: 4,
                  top: 9,
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#E8622A',
                }}
              />
              {item}
            </li>
          ))}
        </ul>
      )

    case 'callout':
      return (
        <div
          style={{
            background: '#FFF4EF',
            borderLeft: '4px solid #E8622A',
            borderRadius: '0 10px 10px 0',
            padding: '14px 16px',
            margin: '8px 0 16px',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: '#E8622A',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Important
          </div>
          <p style={{ fontSize: 14.5, lineHeight: 1.65, color: '#7A3417', margin: 0 }}>
            {block.content}
          </p>
        </div>
      )

    case 'tip':
      return (
        <div
          style={{
            background: '#F0FDF4',
            borderLeft: '4px solid #22C55E',
            borderRadius: '0 10px 10px 0',
            padding: '14px 16px',
            margin: '8px 0 16px',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: '#16A34A',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Note
          </div>
          <p style={{ fontSize: 14.5, lineHeight: 1.65, color: '#166534', margin: 0 }}>
            {block.content}
          </p>
        </div>
      )

    case 'plan-card':
      return <PlanGrid plans={block.plans ?? []} />

    default:
      return null
  }
}

/* ---------- Plan cards (module 4) ---------- */

function PlanGrid({ plans }: { plans: PlanCard[] }) {
  return (
    <div
      className="tm-plan-grid"
      style={{
        display: 'grid',
        gap: 14,
        margin: '4px 0 18px',
      }}
    >
      {plans.map((plan) => (
        <div
          key={plan.name}
          style={{
            position: 'relative',
            border: plan.highlight ? '2px solid #E8622A' : '1px solid #E6EAF0',
            borderRadius: 14,
            padding: '22px 18px 18px',
            background: plan.highlight ? '#FFFBF9' : 'white',
            boxShadow: plan.highlight ? '0 6px 20px rgba(232,98,42,0.12)' : 'none',
          }}
        >
          {plan.highlight && (
            <div
              style={{
                position: 'absolute',
                top: -11,
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#E8622A',
                color: 'white',
                fontSize: 10.5,
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                padding: '4px 12px',
                borderRadius: 20,
                whiteSpace: 'nowrap',
              }}
            >
              Most Popular
            </div>
          )}
          <div style={{ fontSize: 17, fontWeight: 800, color: '#061322' }}>{plan.name}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#E8622A', margin: '6px 0 2px' }}>
            {plan.price}
          </div>
          {plan.setup && (
            <div style={{ fontSize: 12, fontWeight: 600, color: '#9AA7B8', marginBottom: 2 }}>
              {plan.setup}
            </div>
          )}
          <div style={{ fontSize: 12.5, color: '#6B7280', minHeight: 34, lineHeight: 1.4 }}>
            {plan.tagline}
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0' }}>
            {plan.features.map((f, i) => (
              <li
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  color: '#374151',
                  marginBottom: 9,
                }}
              >
                <Check
                  size={15}
                  color="#22C55E"
                  strokeWidth={3}
                  style={{ flexShrink: 0, marginTop: 2 }}
                />
                {f}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <style>{`
        @media (min-width: 768px) {
          .tm-plan-grid { grid-template-columns: repeat(3, 1fr); }
        }
      `}</style>
    </div>
  )
}
