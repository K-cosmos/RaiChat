function formatEvent(event) {
    const start = new Date(event.start.dateTime || event.start.date);
    const end = new Date(event.end.dateTime || event.end.date);

    const formatTime = (date) =>
        `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

    const startTime = formatTime(start);
    const endTime = formatTime(end);

    return `- 🕒 ${startTime}〜${endTime} ${event.summary}`;
}

function filterEvents(events, targetDate) {
    return events.filter((event) => {
        const start = new Date(event.start.dateTime || event.start.date);
        return (
            start.getFullYear() === targetDate.getFullYear() &&
            start.getMonth() === targetDate.getMonth() &&
            start.getDate() === targetDate.getDate()
        );
    });
}

function listEventsForDate(dateLabel = "今日") {
    const targetDate = new Date();

    if (dateLabel === "明日") {
        targetDate.setDate(targetDate.getDate() + 1);
    }

    listEvents(auth, (events) => {
        const todayEvents = filterEvents(events, targetDate);

        if (todayEvents.length === 0) {
            console.log(`📅 ${dateLabel}の予定はないよ〜！ゆっくりしてね🍵`);
        } else {
            console.log(`📅 ${dateLabel}の予定はこんな感じだよ〜！\n`);
            todayEvents.forEach((event) => {
                console.log(formatEvent(event));
            });
        }
    });
}
