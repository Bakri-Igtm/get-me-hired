import { Gift, Package, Coffee, Ticket, Monitor, Crown } from "lucide-react";

const PRIZES = [
  {
    id: 1,
    title: "Rookie Swag Pack",
    description: "Stickers, a pen, and a notebook to get you started.",
    points: 50,
    badge: "Rookie",
    icon: Package,
    color: "bg-blue-50 text-blue-600",
  },
  {
    id: 2,
    title: "$10 Coffee Gift Card",
    description: "Fuel your review sessions with a nice cup of coffee.",
    points: 100,
    badge: null,
    icon: Coffee,
    color: "bg-amber-50 text-amber-600",
  },
  {
    id: 3,
    title: "Pro Reviewer Mug",
    description: "Show off your status with this exclusive ceramic mug.",
    points: 250,
    badge: "Sergeant",
    icon: Gift,
    color: "bg-emerald-50 text-emerald-600",
  },
  {
    id: 4,
    title: "Tech Conference Ticket",
    description: "Virtual pass to a major tech conference of your choice.",
    points: 1000,
    badge: "Captain",
    icon: Ticket,
    color: "bg-purple-50 text-purple-600",
  },
  {
    id: 5,
    title: "Desk Setup Upgrade",
    description: "Mechanical keyboard or high-end mouse.",
    points: 2500,
    badge: "General",
    icon: Monitor,
    color: "bg-slate-50 text-slate-600",
  },
  {
    id: 6,
    title: "1-on-1 Mentorship",
    description: "1 hour session with a senior industry leader.",
    points: 5000,
    badge: "Legend",
    icon: Crown,
    color: "bg-yellow-50 text-yellow-600",
  },
];

export default function PrizesPage() {
  const handleClaim = (prize) => {
    alert(`Sorry, the "${prize.title}" is not available at the moment.`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Rewards & Prizes</h1>
        <p className="text-slate-600 mt-2">
          Redeem your hard-earned points for exclusive rewards.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {PRIZES.map((prize) => {
          const Icon = prize.icon;
          return (
            <div
              key={prize.id}
              onClick={() => handleClaim(prize)}
              className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
            >
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${prize.color}`}>
                <Icon className="w-6 h-6" />
              </div>
              
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                {prize.title}
              </h3>
              <p className="text-sm text-slate-600 mt-1 mb-4">
                {prize.description}
              </p>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <div className="flex flex-col">
                  <span className="text-xs text-slate-500 uppercase tracking-wide">Cost</span>
                  <span className="font-bold text-slate-900">{prize.points} pts</span>
                </div>
                {prize.badge && (
                  <div className="flex flex-col items-end">
                    <span className="text-xs text-slate-500 uppercase tracking-wide">Requires</span>
                    <span className="text-xs font-medium px-2 py-1 bg-slate-100 rounded-full text-slate-700 mt-0.5">
                      {prize.badge}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
