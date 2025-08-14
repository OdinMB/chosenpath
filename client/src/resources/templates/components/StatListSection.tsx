import { PrimaryButton, Icons } from "components/ui";
import { AcademyContextButton } from "components";
import { Stat } from "core/types";
import { StatListItem } from "./StatListItem";
import { StatEditor } from "./StatEditor";

interface StatListSectionProps {
  title: string;
  tooltip: string;
  icon: string;
  iconColor: string;
  stats: Stat[];
  statGroups: string[];
  type: "shared" | "player";
  editingStats: Set<string>;
  onAddStat: (type: "shared" | "player") => void;
  onUpdateStat: (
    type: "shared" | "player",
    index: number,
    updates: Partial<Stat>
  ) => void;
  onRemoveStat: (type: "shared" | "player", index: number) => void;
  onConvertStat: (type: "shared" | "player", index: number) => void;
  setEditingStats: (updater: (prev: Set<string>) => Set<string>) => void;
  readOnly?: boolean;
}

export function StatListSection({
  title,
  icon,
  iconColor,
  stats,
  statGroups,
  type,
  editingStats,
  onAddStat,
  onUpdateStat,
  onRemoveStat,
  onConvertStat,
  setEditingStats,
  readOnly = false,
}: StatListSectionProps) {
  const handleEditStat = (statId: string) => {
    setEditingStats((prev) => new Set(prev).add(statId));
  };

  return (
    <section>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold flex items-center">
            <span
              className={`w-3 h-3 rounded-full ${iconColor} mr-2`}
              title={icon}
            ></span>
            {title}
          </h3>
          <AcademyContextButton
            mode="icon"
            content={
              type === "shared" ? (
                <div>
                  <div className="font-semibold mb-2">Shared Stats</div>
                  <div className="text-sm mb-2">
                    Shared stats have the same values for all players. Good for
                    world conditions, faction relationships, or assets that are
                    shared by all players.
                  </div>
                  <div className="text-sm mb-2">
                    <em>Examples:</em> Kingdom Wealth, Spaceship Integrity.
                  </div>
                  <div className="text-sm">
                    For more information, see the lecture on "Stats".
                  </div>
                </div>
              ) : (
                <div>
                  <div className="font-semibold mb-2">Player Stats</div>
                  <div className="text-sm mb-2">
                    Player stats have different values for each player. Good for
                    personal skills, individual relationships, or
                    character-specific resources.
                  </div>
                  <div className="text-sm mb-2">
                    <em>Examples:</em> Sanity, Community Standing, Romantic
                    Interest.
                  </div>
                  <div className="text-sm">
                    For more, see “Shared vs. Player Stats” in the "Stats"
                    lecture.
                  </div>
                </div>
              )
            }
            link="/academy/stats"
          />
        </div>
        {!readOnly && (
          <PrimaryButton
            variant="outline"
            leftBorder={false}
            size="sm"
            onClick={() => onAddStat(type)}
            disabled={statGroups.length === 0}
            leftIcon={<Icons.Plus className="h-4 w-4" />}
          ></PrimaryButton>
        )}
      </div>

      {statGroups.length === 0 ? (
        <p className="text-gray-500">Add at least one stat group first</p>
      ) : (
        stats.map((stat, index) => {
          const isEditing = editingStats.has(stat.id);

          return (
            <div
              key={stat.id}
              className={`overflow-hidden ${
                isEditing ? "border border-border rounded-md" : ""
              }`}
            >
              {isEditing ? (
                <>
                  <StatEditor
                    stat={stat}
                    index={index}
                    type={type}
                    onUpdateStat={onUpdateStat}
                    onRemoveStat={onRemoveStat}
                    setEditingStats={setEditingStats}
                    statGroups={statGroups}
                    readOnly={readOnly}
                  />
                </>
              ) : (
                <StatListItem
                  stat={stat}
                  index={index}
                  type={type}
                  onEdit={handleEditStat}
                  onConvert={onConvertStat}
                  onDelete={onRemoveStat}
                  readOnly={readOnly}
                />
              )}
            </div>
          );
        })
      )}
    </section>
  );
}
