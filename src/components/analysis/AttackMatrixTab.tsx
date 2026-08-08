import {
  ATTACK_ICS_MATRIX_URL,
  ATTACK_ICS_REVIEWED,
  ATTACK_ICS_VERSION,
  icsTactics,
  icsTechniques
} from "../../data/attackIcs";

interface AttackMatrixTabProps {
  exposedTechniques: ReadonlySet<string>;
}

export function AttackMatrixTab({ exposedTechniques }: AttackMatrixTabProps) {
  return (
    <div className="analysis-content attack-view">
      <div className="assessment-context">
        <div>
          <strong>Curated exposure mapping</strong>
          <span>ATT&amp;CK for ICS v{ATTACK_ICS_VERSION} · reviewed {ATTACK_ICS_REVIEWED}</span>
        </div>
        <a href={ATTACK_ICS_MATRIX_URL} target="_blank" rel="noreferrer">
          Open current matrix
        </a>
      </div>
      <div className="attack-matrix">
        {icsTactics.map((tactic) => {
          const techniques = icsTechniques.filter((technique) => technique.tactic === tactic.id);
          if (techniques.length === 0) {
            return null;
          }
          return (
            <div className="attack-column" key={tactic.id}>
              <h3>{tactic.name}</h3>
              {techniques.map((technique) => (
                <div
                  className={`attack-tech${exposedTechniques.has(technique.id) ? " is-exposed" : ""}`}
                  key={technique.id}
                  title={`${technique.id} ${technique.name}`}
                >
                  <span className="attack-tech-id">{technique.id}</span>
                  <span className="attack-tech-name">{technique.name}</span>
                  {technique.formerIds?.length ? (
                    <span className="attack-tech-former">Previously {technique.formerIds.join(", ")}</span>
                  ) : null}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <p className="muted">
        Techniques in red are plausibly enabled by the current findings. This is a curated, architecture-derived
        exposure view, not evidence that a technique occurred or a claim of full ATT&amp;CK coverage.
      </p>
    </div>
  );
}
