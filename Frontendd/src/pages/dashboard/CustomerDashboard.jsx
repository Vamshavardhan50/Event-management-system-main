import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, MapPin, Ticket } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { Link, useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import ConfirmationModal from '../../components/ui/confirmation-modal';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export default function CustomerDashboard() {
    const { user } = useAuth();

    const [registrations, setRegistrations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('Upcoming Tickets');
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [availableEvents, setAvailableEvents] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedRegistrationId, setSelectedRegistrationId] = useState(null);

    const ticketRef = useRef(null);
    const mountedRef = useRef(true);

    const [searchParams] = useSearchParams();

    const fetchAvailableEvents = useCallback(async () => {
        const tags = searchParams.get('tags');

        try {
            setLoading(true);

            let url = `${API_BASE_URL}/api/events?status=approved`;

            if (tags) {
                url += `&tags=${tags}`;
            }

            const res = await fetch(url);

            if (res.ok) {
                const data = await res.json();

                const upcoming = (data.events || []).filter(
                    (evt) => new Date(evt.date) >= new Date()
                );

                setAvailableEvents(upcoming);
            }
        } catch (error) {
            console.error('Failed to fetch events', error);
        } finally {
            setLoading(false);
        }
    }, [searchParams]);

    const fetchRegistrations = useCallback(async () => {
        try {
            if (mountedRef.current) setLoading(true);

            const token = localStorage.getItem('token');

            const res = await fetch(
                `${API_BASE_URL}/api/registrations/me`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (res.ok && mountedRef.current) {
                const data = await res.json();
                setRegistrations(data.registrations || []);
            }
        } catch (err) {
            console.error(err);
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        (async () => {
            if (activeTab === 'Browse Events') {
                await fetchAvailableEvents();
            } else {
                await fetchRegistrations();
            }
        })();
    }, [activeTab, fetchAvailableEvents, fetchRegistrations]);

    useEffect(() => {
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const handleRegister = async (eventId) => {
        try {
            const token = localStorage.getItem('token');

            const res = await fetch(
                `${API_BASE_URL}/api/registrations/${eventId}/register`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            const data = await res.json();

            if (res.ok) {
                toast.success(data.message || 'Registered');
                setActiveTab('Upcoming Tickets');
                fetchRegistrations();
            } else {
                toast.error(data.message || 'Registration failed');
            }
        } catch (err) {
            console.error(err);
            toast.error('Something went wrong');
        }
    };

    const handleCancelRegistration = async () => {
        try {
            const token = localStorage.getItem('token');

            const res = await fetch(
                `${API_BASE_URL}/api/registrations/${selectedRegistrationId}/cancel`,
                {
                    method: 'DELETE',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Failed to cancel');
            }

            setRegistrations((prev) =>
                prev.map((r) =>
                    r._id === selectedRegistrationId
                        ? { ...r, status: 'cancelled' }
                        : r
                )
            );

            setSelectedRegistrationId(null);
            setIsModalOpen(false);

            toast.success('Registration cancelled');
        } catch (err) {
            console.error(err);
            toast.error('Something went wrong');
        }
    };

    const handleDownloadTicket = async () => {
        try {
            if (!ticketRef.current || !selectedTicket) return;

            const canvas = await html2canvas(ticketRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
            });

            const imgData = canvas.toDataURL('image/png');

            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();

            const imgProps = pdf.getImageProperties(imgData);

            const pdfHeight =
                (imgProps.height * (pdfWidth - 20)) / imgProps.width;

            pdf.setFontSize(20);
            pdf.setTextColor(244, 63, 94);

            pdf.text('EventOne Ticket', 15, 15);

            const maxHeight = 250;

            let finalWidth = pdfWidth - 20;
            let finalHeight = pdfHeight;

            if (pdfHeight > maxHeight) {
                const scaleFactor = maxHeight / pdfHeight;

                finalHeight = maxHeight;
                finalWidth = finalWidth * scaleFactor;
            }

            pdf.addImage(
                imgData,
                'PNG',
                10,
                25,
                finalWidth,
                finalHeight
            );

            const safeEventName = selectedTicket.event?.title
                ?.replace(/\s+/g, '-')
                ?.replace(/[^a-zA-Z0-9-_]/g, '')
                ?.toUpperCase();

            const fileName = `ticket-${
                safeEventName || 'EVENT'
            }-${selectedTicket._id
                .slice(-6)
                .toUpperCase()}.pdf`;

            pdf.save(fileName);
        } catch (error) {
            console.error('PDF generation failed:', error);
        }
    };

    const upcomingEvents = registrations.filter(
        (reg) =>
            reg.event &&
            reg.status !== 'cancelled' &&
            new Date(reg.event.date) >= new Date()
    );

    const pastEvents = registrations.filter(
        (reg) =>
            reg.event &&
            reg.status !== 'cancelled' &&
            new Date(reg.event.date) < new Date()
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#09090b]">
                <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground pt-32 px-4 sm:px-6 lg:px-8 font-sans">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-12">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                            Welcome back,{' '}
                            <span className="text-rose-500">
                                {user?.name || 'User'}
                            </span>
                        </h1>

                        <p className="text-muted-foreground mt-2 text-base">
                            Manage your tickets and view your event history.
                        </p>
                    </div>

                    <div>
                        <span className="inline-flex items-center justify-center px-4 py-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-500 text-xs font-semibold tracking-wider uppercase">
                            Customer Dashboard
                        </span>
                    </div>
                </div>

                <div className="mb-8 border-b border-border">
                    <div className="flex space-x-8 overflow-x-auto no-scrollbar">
                        {[
                            'Upcoming Tickets',
                            'Past Events',
                            'Browse Events',
                        ].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`pb-4 text-sm font-medium transition-colors relative whitespace-nowrap ${
                                    activeTab === tab
                                        ? 'text-orange-500'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {tab}

                                {activeTab === tab && (
                                    <motion.div
                                        layoutId="activeTab"
                                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500"
                                    />
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-card/50 backdrop-blur-sm rounded-3xl p-6 md:p-8 min-h-[500px] border border-border shadow-sm">
                    <AnimatePresence mode="popLayout">
                        {activeTab === 'Upcoming Tickets' && (
                            <div className="space-y-6">
                                {upcomingEvents.length === 0 ? (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="w-full h-80 border border-dashed border-border rounded-2xl flex flex-col items-center justify-center text-center p-6"
                                    >
                                        <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
                                            <Ticket className="w-8 h-8 text-muted-foreground" />
                                        </div>

                                        <h3 className="text-lg font-medium">
                                            No upcoming tickets
                                        </h3>

                                        <Button
                                            asChild
                                            className="mt-6 bg-rose-600 hover:bg-rose-700"
                                        >
                                            <Link to="/#events">
                                                Browse Events
                                            </Link>
                                        </Button>
                                    </motion.div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-6">
                                        {upcomingEvents.map((reg, idx) => (
                                            <motion.div
                                                key={reg._id}
                                                layout
                                                initial={{
                                                    opacity: 0,
                                                    y: 10,
                                                }}
                                                animate={{
                                                    opacity: 1,
                                                    y: 0,
                                                }}
                                                transition={{
                                                    delay: idx * 0.05,
                                                }}
                                                className="group relative bg-card border border-border rounded-2xl p-4"
                                            >
                                                <h3 className="text-lg font-semibold">
                                                    {reg.event?.title}
                                                </h3>

                                                <div className="flex gap-4 mt-3 text-sm text-muted-foreground">
                                                    <span className="flex items-center">
                                                        <Calendar className="w-4 h-4 mr-1" />
                                                        {new Date(
                                                            reg.event?.date
                                                        ).toLocaleDateString()}
                                                    </span>

                                                    <span className="flex items-center">
                                                        <MapPin className="w-4 h-4 mr-1" />
                                                        {reg.event?.location}
                                                    </span>
                                                </div>

                                                <div className="flex gap-2 mt-4">
                                                    <Button
                                                        variant="outline"
                                                        onClick={() =>
                                                            setSelectedTicket(
                                                                reg
                                                            )
                                                        }
                                                    >
                                                        View Details
                                                    </Button>

                                                    <Button
                                                        variant="outline"
                                                        className="bg-rose-600 text-white"
                                                        onClick={() => {
                                                            setSelectedRegistrationId(
                                                                reg._id
                                                            );
                                                            setIsModalOpen(
                                                                true
                                                            );
                                                        }}
                                                    >
                                                        Cancel Registration
                                                    </Button>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'Past Events' && (
                            <div className="space-y-6">
                                {pastEvents.map((reg) => (
                                    <div
                                        key={reg._id}
                                        className="border rounded-2xl p-4"
                                    >
                                        <h3 className="text-lg font-semibold">
                                            {reg.event?.title}
                                        </h3>
                                    </div>
                                ))}
                            </div>
                        )}

                        {activeTab === 'Browse Events' && (
                            <div className="space-y-6">
                                {availableEvents.length === 0 ? (
                                    <div className="text-center py-10">
                                        No upcoming events found
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-6">
                                        {availableEvents.map((evt, idx) => {
                                            const isRegistered =
                                                registrations.some(
                                                    (r) =>
                                                        r.status ===
                                                            'registered' &&
                                                        r.event?._id ===
                                                            evt._id
                                                );

                                            const isEventFullBooked =
                                                evt.registeredCount >=
                                                evt.capacity;

                                            return (
                                                <motion.div
                                                    key={evt._id}
                                                    layout
                                                    initial={{
                                                        opacity: 0,
                                                        y: 10,
                                                    }}
                                                    animate={{
                                                        opacity: 1,
                                                        y: 0,
                                                    }}
                                                    transition={{
                                                        delay: idx * 0.05,
                                                    }}
                                                    className="group relative bg-card border border-border rounded-2xl p-4"
                                                >
                                                    <h3 className="text-lg font-semibold">
                                                        {evt.title}
                                                    </h3>

                                                    <p className="text-muted-foreground text-sm mt-2">
                                                        {evt.description}
                                                    </p>

                                                    <div className="flex justify-end mt-4">
                                                        {isRegistered ? (
                                                            <Button disabled>
                                                                Registered
                                                            </Button>
                                                        ) : isEventFullBooked ? (
                                                            <Button disabled>
                                                                Fully Booked
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                className="bg-rose-600 hover:bg-rose-700 text-white"
                                                                onClick={() =>
                                                                    handleRegister(
                                                                        evt._id
                                                                    )
                                                                }
                                                            >
                                                                Register Now
                                                            </Button>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </AnimatePresence>

                    <ConfirmationModal
                        isOpen={isModalOpen}
                        onClose={() => setIsModalOpen(false)}
                        onConfirm={handleCancelRegistration}
                        title="Cancel registration"
                        description="Are you sure you want to cancel this registration?"
                    />
                </div>
            </div>
        </div>
    );
}