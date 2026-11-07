(function (scope) {
  const definitions = [
    {
      id: 'first-trip',
      icon: '🚇',
      name: 'First Stop',
      metric: 'rides',
      target: 1,
      description: 'Complete your first journey',
    },
    {
      id: 'five-trips',
      icon: '🎫',
      name: 'Commute Starter',
      metric: 'rides',
      target: 5,
      description: 'Complete 5 journeys',
    },
    {
      id: 'twenty-trips',
      icon: '🏙️',
      name: 'City Regular',
      metric: 'rides',
      target: 20,
      description: 'Complete 20 journeys',
    },
    {
      id: 'five-stations',
      icon: '📍',
      name: 'City Explorer',
      metric: 'stations',
      target: 5,
      description: 'Visit 5 different origin or destination stations',
    },
    {
      id: 'ten-stations',
      icon: '🗽',
      name: 'Station Collector',
      metric: 'stations',
      target: 10,
      description: 'Visit 10 different origin or destination stations',
    },
    {
      id: 'first-favorite',
      icon: '⭐',
      name: 'My Commute',
      metric: 'favorite',
      target: 1,
      description: 'Bookmark your first route',
    },
  ];

  const empty = () => ({
    version: 1,
    trips: [],
    unlocked: {},
    hasBookmarked: false,
    active: null,
  });

  function normalize(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.trips)) {
      return empty();
    }
    const trips = value.trips.filter(
      (trip) =>
        trip &&
        typeof trip.id === 'string' &&
        typeof trip.origin === 'string' &&
        typeof trip.destination === 'string' &&
        trip.origin !== trip.destination &&
        Number.isFinite(Date.parse(trip.completedAt))
    );
    return {
      ...empty(),
      trips: [...new Map(trips.map((trip) => [trip.id, trip])).values()],
      hasBookmarked: value.hasBookmarked === true,
      unlocked: Object.fromEntries(
        Object.entries(value.unlocked || {}).filter(
          ([id, date]) =>
            definitions.some((definition) => definition.id === id) &&
            typeof date === 'string' &&
            Number.isFinite(Date.parse(date))
        )
      ),
      active:
        value.active &&
        typeof value.active.id === 'string' &&
        typeof value.active.origin === 'string' &&
        typeof value.active.destination === 'string' &&
        value.active.origin !== value.active.destination
          ? value.active
          : null,
    };
  }

  function stats(progress) {
    return {
      rides: progress.trips.length,
      stations: new Set(
        progress.trips.flatMap((trip) => [trip.origin, trip.destination])
      ).size,
      favorite: progress.hasBookmarked ? 1 : 0,
    };
  }

  function unlock(progress, now) {
    const totals = stats(progress);
    const unlocked = { ...progress.unlocked };
    definitions.forEach((definition) => {
      if (
        totals[definition.metric] >= definition.target &&
        !unlocked[definition.id]
      ) {
        unlocked[definition.id] = now;
      }
    });
    return { ...progress, unlocked };
  }

  function start(progress, origin, destination, id) {
    if (!origin || !destination || origin === destination) return progress;
    return { ...progress, active: { id, origin, destination } };
  }

  function complete(progress, now) {
    const journey = progress.active;
    if (
      !journey ||
      journey.origin === journey.destination ||
      progress.trips.some((trip) => trip.id === journey.id)
    ) {
      return progress;
    }

    const completed = unlock(
      {
        ...progress,
        active: null,
        trips: [...progress.trips, { ...journey, completedAt: now }],
      },
      now
    );
    return completed;
  }

  function cancel(progress) {
    return { ...progress, active: null };
  }

  function bookmark(progress, now) {
    return unlock({ ...progress, hasBookmarked: true }, now);
  }

  scope.MetroAchievements = {
    definitions,
    empty,
    normalize,
    stats,
    start,
    complete,
    cancel,
    bookmark,
  };
})(globalThis);
